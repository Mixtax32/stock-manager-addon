# 📦 Stock Manager Add-on para Home Assistant (v0.5.6)

Este repositorio contiene el complemento de gestión de stock para Home Assistant.

## 🚀 Funcionalidades Clave

*   📷 **Escáner de Códigos de Barras**: Detección en tiempo real desde el móvil o tablet.
*   🧾 **Procesamiento de Tickets**: Captura tickets completos de supermercados (OCR) para añadir lotes.
*   🍎 **Seguimiento de Macros**: Kcal, proteínas, carbohidratos y grasas automáticos.
*   📅 **Gestión de Lotes y Caducidad**: Rastrea cada unidad por su fecha de vencimiento.
*   🤖 **Integración con Telegram**: Bot inteligente para consultar buscador, añadir stock y consultar macros fuera de casa.
*   📊 **Dashboard de Consumo**: Gráficos de tendencias y estado de la despensa.

## 📁 Instalación y Configuración

1. Añade este repositorio a tu tienda de add-ons en Home Assistant.
2. Busca "Stock Manager" e instala.
3. En la pestaña de **Configuración**, pega tu `telegram_token` y tu `allowed_chat_ids`.
4. Inicia el add-on.

## 📡 Modo portátil (báscula Bluetooth fuera de casa)

Cuando estás fuera de casa, la báscula Bluetooth se conecta al móvil vía Web Bluetooth y los pesos viajan a tu HA por Nabu Casa. La interfaz vive en una página estática hospedada en GitHub Pages (no en la addon, por una limitación de la ingress de HA).

- **URL del puente**: [https://mixtax32.github.io/stock-manager-addon/bridge/](https://mixtax32.github.io/stock-manager-addon/bridge/)
- **Setup y arquitectura completos**: [docs/bridge/README.md](docs/bridge/README.md)

Requiere Chrome en Android y Nabu Casa activo. No funciona en iOS (Safari no soporta Web Bluetooth).

---

Para más detalles, consulta el [README de la aplicación](stock-manager/README.md).

Creado por la comunidad, para la comunidad.
