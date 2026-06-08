"""
HA WebSocket subscriber — Phase 3 of the portable BLE bridge.

Connects to Home Assistant's WebSocket API from inside the addon container,
subscribes to the custom `stock_manager_bridge_weight` event, and routes every
event to the same ingestion function (`db.record_scale_weight`) that the local
WiFi flow uses. Weight coming via the BLE bridge is indistinguishable from
weight coming via the existing ESP32-over-WiFi endpoint.

The Supervisor proxies addon traffic to HA core: WS URL `ws://supervisor/core/websocket`
and the `SUPERVISOR_TOKEN` env var auths against core (requires `homeassistant_api: true`
in `config.yaml` — without that flag the token has no core scope and auth_invalid).

Architectural references (engram):
- portable-mode/bridge-architecture
- portable-mode/ha-event-contract
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Optional

import websockets
from websockets.exceptions import ConnectionClosed

from .database import db

logger = logging.getLogger(__name__)

HA_WS_URL = "ws://supervisor/core/websocket"
BRIDGE_EVENT_TYPE = "stock_manager_bridge_weight"
ADMIN_EVENT_TYPE = "stock_manager_admin"

# Each tuple: (subscribe_id, event_type). Subscribe ids must be unique per
# WebSocket session; they're just the request correlation handle for HA.
_SUBSCRIPTIONS = [
    (1, BRIDGE_EVENT_TYPE),
    (2, ADMIN_EVENT_TYPE),
]

# Cap the exponential backoff at 60s. The last value is reused indefinitely.
_RECONNECT_BACKOFF_S = [1, 2, 5, 10, 30, 60]


class HABridgeSubscriber:
    def __init__(self) -> None:
        self._task: Optional[asyncio.Task] = None
        self._stop_event: asyncio.Event = asyncio.Event()

    async def start(self) -> None:
        token = os.environ.get("SUPERVISOR_TOKEN")
        if not token:
            # Running outside the addon container (e.g. local dev). Disable
            # silently — the rest of the app must keep working.
            logger.warning(
                "SUPERVISOR_TOKEN not set; HA bridge subscriber disabled. "
                "This is expected outside the addon container."
            )
            return
        self._stop_event.clear()
        self._task = asyncio.create_task(self._run(token), name="ha_bridge_ws")
        logger.info("HA bridge subscriber started (listening for %s).", BRIDGE_EVENT_TYPE)

    async def stop(self) -> None:
        if self._task is None:
            return
        self._stop_event.set()
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None
        logger.info("HA bridge subscriber stopped.")

    async def _run(self, token: str) -> None:
        attempt = 0
        while not self._stop_event.is_set():
            try:
                await self._connect_and_subscribe(token)
                attempt = 0  # successful session resets backoff
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 — log + retry every failure mode
                wait = _RECONNECT_BACKOFF_S[min(attempt, len(_RECONNECT_BACKOFF_S) - 1)]
                logger.warning(
                    "HA WS error (%s: %s); reconnecting in %ds.",
                    type(exc).__name__, exc, wait,
                )
                attempt += 1
                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=wait)
                except asyncio.TimeoutError:
                    pass

    async def _connect_and_subscribe(self, token: str) -> None:
        # websockets v12 default keepalive: ping every 20s, drop after 20s no pong.
        # That's enough to notice a dead HA without us writing extra heartbeats.
        async with websockets.connect(HA_WS_URL, max_size=2**20) as ws:
            # Step 1: server greets us with auth_required.
            msg = json.loads(await ws.recv())
            if msg.get("type") != "auth_required":
                raise RuntimeError(f"unexpected first message: {msg}")

            # Step 2: send auth using SUPERVISOR_TOKEN.
            await ws.send(json.dumps({"type": "auth", "access_token": token}))
            msg = json.loads(await ws.recv())
            if msg.get("type") != "auth_ok":
                raise RuntimeError(f"HA WS auth failed: {msg}")
            logger.info("HA WS authenticated.")

            # Step 3: subscribe to every event type in _SUBSCRIPTIONS.
            for sub_id, event_type in _SUBSCRIPTIONS:
                await ws.send(json.dumps({
                    "id": sub_id,
                    "type": "subscribe_events",
                    "event_type": event_type,
                }))
                msg = json.loads(await ws.recv())
                if not (msg.get("type") == "result" and msg.get("success")):
                    raise RuntimeError(f"subscribe_events({event_type}) failed: {msg}")
                logger.info("Subscribed to event %s.", event_type)

            # Step 4: receive events until stop or disconnect.
            while not self._stop_event.is_set():
                raw = await ws.recv()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    logger.warning("HA WS sent non-JSON frame; ignoring.")
                    continue
                if msg.get("type") != "event":
                    continue
                event = msg.get("event") or {}
                event_type = event.get("event_type")
                if event_type == BRIDGE_EVENT_TYPE:
                    await self._handle_bridge_weight(event)
                elif event_type == ADMIN_EVENT_TYPE:
                    await self._handle_admin_command(event)

    async def _handle_bridge_weight(self, event: dict) -> None:
        data = event.get("data") or {}
        scale_id_raw = data.get("scale_id")
        weight_raw = data.get("weight_g")
        if scale_id_raw is None or weight_raw is None:
            logger.warning("Bridge event missing scale_id or weight_g: %s", data)
            return
        # Bridge sends scale_id as string (info characteristic or fallback text input);
        # the rest of the addon uses int.
        try:
            scale_id = int(scale_id_raw)
        except (TypeError, ValueError):
            logger.warning("Bridge event has non-numeric scale_id=%r; dropped.", scale_id_raw)
            return
        try:
            weight_g = float(weight_raw)
        except (TypeError, ValueError):
            logger.warning("Bridge event has non-numeric weight_g=%r; dropped.", weight_raw)
            return
        try:
            scale = await db.record_scale_weight(scale_id, weight_g)
        except Exception:
            logger.exception("Error recording bridge weight for scale_id=%s", scale_id)
            return
        if scale is None:
            logger.warning("Bridge event for unknown scale_id=%s; dropped.", scale_id)
            return
        logger.debug("Bridge ingested weight=%.1fg for scale_id=%s.", weight_g, scale_id)

    async def _handle_admin_command(self, event: dict) -> None:
        """Receives admin/maintenance commands via HA events. The bearer of the
        HA long-lived token can fire `stock_manager_admin` events with a
        `command` field; we dispatch them here. Logged at INFO so the addon
        log shows what was triggered and from where.

        Supported commands:
          - `cancel_all_cook_sessions`: cancel every active cook session.
          - `cancel_cook_session` + `session_id`: cancel one specific session.
        """
        data = event.get("data") or {}
        command = data.get("command")
        origin = event.get("origin", "?")
        logger.info("[admin] received command=%r data=%s origin=%s", command, data, origin)
        try:
            if command == "cancel_all_cook_sessions":
                count = await db.cancel_all_active_cook_sessions()
                logger.info("[admin] cancelled %d active cook session(s).", count)
            elif command == "cancel_cook_session":
                session_id_raw = data.get("session_id")
                if session_id_raw is None:
                    logger.warning("[admin] cancel_cook_session missing session_id.")
                    return
                session_id = int(session_id_raw)
                ok = await db.cancel_cook_session(session_id)
                logger.info("[admin] cancel_cook_session(%d) -> %s.", session_id, ok)
            else:
                logger.warning("[admin] unknown command: %r", command)
        except Exception:
            logger.exception("[admin] command failed: %r", command)


# Singleton — imported from main.py for lifespan hookup.
ha_bridge = HABridgeSubscriber()
