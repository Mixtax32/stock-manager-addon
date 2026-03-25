# 📦 Stock Manager v0.5.6

**El sistema definitivo para gestionar tu despensa desde Home Assistant.**

Stock Manager es un complemento (add-on) para Home Assistant que te permite llevar un control total de tus productos, fechas de caducidad y valores nutricionales de forma rápida y sencilla.

---

## 🚀 Características Principales

*   📷 **Escáner Inteligente**: Captura códigos de barras con la cámara o busca por nombre.
*   🧾 **OCR de Tickets**: Escanea tickets de compra completos para añadir múltiples productos de una vez (Tesseract.js).
*   📅 **Control de Caducidad**: Visualiza qué productos vencen pronto con alertas de colores y un selector de fecha táctil (Wheel Picker).
*   🍎 **Seguimiento Nutricional**: Obtiene automáticamente Kcal, Proteínas, Carbohidratos y Grasas desde *Open Food Facts*.
*   🤖 **Bot de Telegram**: Gestiona tu stock, busca productos o envía fotos de códigos de barras desde cualquier lugar.
*   📊 **Estadísticas y Gráficos**: Gráfico de consumo diario y resumen de macros del día.
*   🛒 **Lista de la Compra**: Generación automática basada en tu stock mínimo configurado.
*   💾 **Importar/Exportar**: Soporte completo para archivos CSV.

---

## 🛠️ Instalación

1.  Copia la carpeta `stock-manager` a tu directorio `/addons/`.
2.  Reinicia o ve a la **Tienda de complementos** → **⋮** → **Actualizar repositorios**.
3.  Instala y pulsa **Iniciar**.
4.  (Opcional) Activa "Mostrar en la barra lateral".

---

## 🤖 Configuración del Bot de Telegram

Para usar el bot, simplemente introduce tu token y los IDs permitidos en la pestaña de **Configuración** del add-on en Home Assistant:

- **telegram_token**: Pega aquí el token de BotFather.
- **allowed_chat_ids**: Lista de IDs de Telegram que pueden usar el bot.

---

## 📂 Estructura del Proyecto

*   `app/main.py`: Backend FastAPI de alto rendimiento.
*   `app/telegram_service.py`: Gestión del bot de Telegram asíncrono.
*   `app/static/`: Interfaz moderna con CSS puro y JS (Vanilla).
*   `app/database.py`: Motor de base de datos SQLite con soporte para lotes (batches).

---

## 🧪 Desarrollo

Este add-on está construido pensando en la simplicidad y la velocidad:
*   **Backend**: Python, FastAPI, SQLite.
*   **Frontend**: HTML5, Vanilla CSS, Vanilla JS.
*   **Bibliotecas**: Chart.js, Tesseract.js, Html5Qrcode.

Creado con ❤️ para la comunidad de Home Assistant.