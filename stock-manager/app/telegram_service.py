import os
import logging
import asyncio
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes, CallbackQueryHandler
from .database import db
from .models import StockUpdate
import json

logger = logging.getLogger(__name__)

class TelegramService:
    def __init__(self):
        self.token = os.getenv("TELEGRAM_TOKEN")
        allowed_ids_str = os.getenv("ALLOWED_CHAT_IDS", "[]")
        try:
            # Handle both JSON array and comma-separated string
            if allowed_ids_str.startswith('['):
                self.allowed_chat_ids = json.loads(allowed_ids_str)
            else:
                self.allowed_chat_ids = [int(i.strip()) for i in allowed_ids_str.split(',') if i.strip()]
        except Exception as e:
            logger.error(f"Error parsing ALLOWED_CHAT_IDS: {e}")
            self.allowed_chat_ids = []
            
        self.application = None

    def is_authorized(self, chat_id: int) -> bool:
        if not self.allowed_chat_ids:
            return True  # If not set, allow all (security risk, but better for first setup)
        return chat_id in self.allowed_chat_ids

    async def start_cmd(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        chat_id = update.effective_chat.id
        if not self.is_authorized(chat_id):
            await update.message.reply_text(f"❌ No tienes permiso para usar este bot. Tu Chat ID es: {chat_id}")
            return

        welcome_text = (
            "👋 ¡Hola! Soy el asistente de **Stock Manager**.\n\n"
            "Puedo ayudarte a gestionar tu inventario desde aquí.\n\n"
            "**Comandos disponibles:**\n"
            "🔍 `/buscar <nombre>` - Busca productos\n"
            "➕ `/sumar <nombre/barcode> <cantidad>` - Añade stock\n"
            "➖ `/restar <nombre/barcode> <cantidad>` - Quita stock\n"
            "📦 `/bajo_stock` - Lista productos que se están agotando\n"
            "📋 `/inventario` - Ver resumen del inventario\n"
            "❓ `/ayuda` - Muestra este mensaje\n\n"
            "También puedes enviarme un **código de barras** directamente."
        )
        await update.message.reply_text(welcome_text, parse_mode="Markdown")

    async def help_cmd(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        await self.start_cmd(update, context)

    async def buscar_cmd(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        if not self.is_authorized(update.effective_chat.id): return
        
        if not context.args:
            await update.message.reply_text("Uso: `/buscar <nombre del producto>`", parse_mode="Markdown")
            return

        query = " ".join(context.args)
        products = await db.get_all_products()
        
        # Simple fuzzy match / contains
        matches = [p for p in products if query.lower() in p.name.lower()]
        
        if not matches:
            await update.message.reply_text(f"No he encontrado nada que coincida con '{query}'")
            return

        response = f"🔍 **Resultados para '{query}':**\n\n"
        for p in matches[:10]: # Limit to 10
            response += f"• `{p.barcode}` - **{p.name}**: {p.stock} uds. (Min: {p.min_stock})\n"
        
        if len(matches) > 10:
            response += f"\n_...y {len(matches) - 10} más._"

        await update.message.reply_text(response, parse_mode="Markdown")

    async def low_stock_cmd(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        if not self.is_authorized(update.effective_chat.id): return
        
        low_stock = await db.get_low_stock_products()
        if not low_stock:
            await update.message.reply_text("✅ ¡Todo en orden! No hay productos bajo el mínimo.")
            return

        response = "⚠️ **Productos con bajo stock:**\n\n"
        for p in low_stock:
            response += f"• **{p.name}**: {p.stock} / {p.min_stock} (Min)\n"
        
        await update.message.reply_text(response, parse_mode="Markdown")

    async def stats_cmd(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        if not self.is_authorized(update.effective_chat.id): return
        
        stats = await db.get_stats()
        response = (
            "📊 **Estado del Inventario**\n\n"
            f"📦 Productos totales: {stats['total_products']}\n"
            f"🔢 Unidades totales: {stats['total_units']}\n"
            f"⚠️ Bajo stock: {stats['low_stock_count']}"
        )
        await update.message.reply_text(response, parse_mode="Markdown")

    async def stock_update_cmd(self, update: Update, context: ContextTypes.DEFAULT_TYPE, change: int):
        if not self.is_authorized(update.effective_chat.id): return
        
        if len(context.args) < 1:
            cmd = "sumar" if change > 0 else "restar"
            await update.message.reply_text(f"Uso: `/{cmd} <nombre_o_barcode> [cantidad]`", parse_mode="Markdown")
            return

        # Default quantity to 1 if not specified
        qty = change
        identifier = context.args[0]
        
        if len(context.args) > 1:
            try:
                qty = int(context.args[1]) * (1 if change > 0 else -1)
            except ValueError:
                # If second arg is not a number, maybe they typed its name with spaces
                identifier = " ".join(context.args[:-1])
                try:
                    qty = int(context.args[-1]) * (1 if change > 0 else -1)
                except ValueError:
                    identifier = " ".join(context.args)
                    qty = change

        # Try to find by barcode or name
        product = await db.get_product(identifier)
        if not product:
            # Search by name
            products = await db.get_all_products()
            matches = [p for p in products if identifier.lower() in p.name.lower()]
            if len(matches) == 1:
                product = matches[0]
            elif len(matches) > 1:
                # Ask to be more specific
                response = f"He encontrado varios productos. Sé más específico:\n"
                for m in matches[:5]:
                    response += f"• `{m.barcode}` - {m.name}\n"
                await update.message.reply_text(response, parse_mode="Markdown")
                return
            else:
                await update.message.reply_text(f"❌ No encuentro el producto '{identifier}'")
                return

        try:
            # Update stock
            reason = "telegram_bot"
            updated_product = await db.update_stock(product.barcode, StockUpdate(quantity=qty, reason=reason))
            
            action = "Añadidas" if qty > 0 else "Quitadas"
            symbol = "✅" if qty > 0 else "📉"
            await update.message.reply_text(
                f"{symbol} **{abs(qty)}** unidades de **{product.name}** {action.lower()}.\n"
                f"Stock actual: **{updated_product.stock}** uds.",
                parse_mode="Markdown"
            )
        except Exception as e:
            await update.message.reply_text(f"❌ Error: {str(e)}")

    async def handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        if not self.is_authorized(update.effective_chat.id): return
        
        text = update.message.text.strip()
        
        # Check if it looks like a barcode (mainly numbers)
        if text.isdigit() and len(text) >= 8:
            product = await db.get_product(text)
            if product:
                # Show product and options
                keyboard = [
                    [
                        InlineKeyboardButton("➖ 1", callback_data=f"sub_{text}_1"),
                        InlineKeyboardButton("➕ 1", callback_data=f"add_{text}_1")
                    ],
                    [
                        InlineKeyboardButton("➖ 5", callback_data=f"sub_{text}_5"),
                        InlineKeyboardButton("➕ 5", callback_data=f"add_{text}_5")
                    ]
                ]
                reply_markup = InlineKeyboardMarkup(keyboard)
                await update.message.reply_text(
                    f"📦 **{product.name}**\nStock actual: **{product.stock}**",
                    reply_markup=reply_markup,
                    parse_mode="Markdown"
                )
            else:
                await update.message.reply_text(
                    f"❓ Código `{text}` no encontrado.\nUsa `/buscar` para localizarlo por nombre.",
                    parse_mode="Markdown"
                )
        else:
            # Just search
            context.args = [text]
            await self.buscar_cmd(update, context)

    async def handle_callback(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        query = update.callback_query
        if not self.is_authorized(query.message.chat_id): return
        
        await query.answer()
        
        # Format: action_barcode_qty
        parts = query.data.split('_')
        if len(parts) != 3: return
        
        action, barcode, qty_str = parts
        qty = int(qty_str)
        if action == "sub": qty = -qty
        
        try:
            product = await db.update_stock(barcode, StockUpdate(quantity=qty, reason="telegram_inline"))
            
            # Update the original message
            keyboard = [
                [
                    InlineKeyboardButton("➖ 1", callback_data=f"sub_{barcode}_1"),
                    InlineKeyboardButton("➕ 1", callback_data=f"add_{barcode}_1")
                ],
                [
                    InlineKeyboardButton("➖ 5", callback_data=f"sub_{barcode}_5"),
                    InlineKeyboardButton("➕ 5", callback_data=f"add_{barcode}_5")
                ]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            await query.edit_message_text(
                f"📦 **{product.name}**\nStock actual: **{product.stock}**",
                reply_markup=reply_markup,
                parse_mode="Markdown"
            )
        except Exception as e:
            await query.message.reply_text(f"❌ Error: {str(e)}")

    async def run(self):
        if not self.token:
            logger.warning("TELEGRAM_TOKEN no configurado. Bot de Telegram desactivado.")
            return

        self.application = ApplicationBuilder().token(self.token).build()
        
        # Add handlers
        self.application.add_handler(CommandHandler("start", self.start_cmd))
        self.application.add_handler(CommandHandler("ayuda", self.help_cmd))
        self.application.add_handler(CommandHandler("buscar", self.buscar_cmd))
        self.application.add_handler(CommandHandler("bajo_stock", self.low_stock_cmd))
        self.application.add_handler(CommandHandler("inventario", self.stats_cmd))
        self.application.add_handler(CommandHandler("sumar", lambda u, c: self.stock_update_cmd(u, c, 1)))
        self.application.add_handler(CommandHandler("restar", lambda u, c: self.stock_update_cmd(u, c, -1)))
        
        self.application.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), self.handle_message))
        self.application.add_handler(CallbackQueryHandler(self.handle_callback))

        logger.info("Bot de Telegram iniciado")
        async with self.application:
            await self.application.initialize()
            await self.application.start()
            await self.application.updater.start_polling()
            
            # Keep running until cancelled
            while True:
                await asyncio.sleep(1)

telegram_bot = TelegramService()
