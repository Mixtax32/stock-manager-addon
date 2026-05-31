# 📦 Stock Manager v0.8.32

**Gestión completa de despensa, recetas, macros y planificación semanal desde Home Assistant.**

Stock Manager es un add-on para Home Assistant que combina inventario, control de caducidades, recetas, plan semanal de comidas, seguimiento de macros diarios y gráficos de evolución. Todo se guarda en la base de datos del add-on, así que los datos están sincronizados entre todos los dispositivos donde abras la app.

---

## 🚀 Características

### 🥫 Despensa
- 📷 **Escáner de códigos de barras** con la cámara (vía captura de imagen, sin necesidad de HTTPS).
- 🧾 **Lector de tickets** con OCR en el backend (Tesseract + OpenCV): detecta las líneas del ticket y las matchea con tus productos por similitud.
- 📅 **Caducidad y ubicación por lote**: cada lote tiene su propia fecha y ubicación (Nevera, Congelador, Despensa, Otros). El mismo producto puede tener stock en varios sitios a la vez.
- 🍎 **Datos nutricionales** auto-completados desde Open Food Facts.
- 🔴 **Indicador de stock bajo** por producto + edición rápida del stock tecleando directamente.

### 🍳 Recetas
- 📝 **Builder completo**: ingredientes, raciones, tiempo, etiquetas, comidas asociadas (desayuno/almuerzo/comida/...) y caducidad separada para nevera y congelador.
- 🥡 **"Hacer" inteligente**: te pide cuántas unidades vas a hacer y dónde las vas a guardar. Escala los ingredientes proporcionalmente, los descuenta del stock y crea el lote en la ubicación elegida con la caducidad correcta.
- 🔍 **Filtros**: rápidas (≤15 min), alto en proteína, con ingredientes de tu despensa.

### 📅 Diario y planificación
- 🍽️ **Diario del día** con desayuno, almuerzo, comida, merienda, cena y snacks. Añadir un alimento al diario descuenta el stock automáticamente.
- 📆 **Plan semanal** con generador automático que optimiza los 4 macros (kcal, proteínas, carbohidratos, grasas), no solo calorías. Tiene en cuenta variedad y las comidas asociadas a cada receta.
- 🛒 **Lista de la compra automática** derivada del stock bajo: lo que falta aparece solo y desaparece cuando reponés. Sección extra para añadir cosas manuales.

### 📊 Seguimiento
- ⚖️ **Registro de peso** con historial diario.
- 📈 **Gráficos** de peso corporal y consumo de kcal vs. tu objetivo, con selector de rango (7d / 30d / 90d / todo).
- 🎯 **Objetivos de macros** con calculadora por peso corporal y constante kcal/kg ajustable.

### 🔧 Otros
- 🤖 **Bot de Telegram** para gestión rápida desde el móvil.
- 🌗 **Tema claro / oscuro**.
- 🔄 **Sincronización entre dispositivos**: toda la información se persiste en el backend, así que móvil, tablet y PC ven exactamente lo mismo.
- 💾 **Importar y exportar CSV** del inventario.

---

## 🛠️ Instalación

1. Copia la carpeta `stock-manager` a tu directorio `/addons/`.
2. Ve a la **Tienda de complementos** → **⋮** → **Actualizar repositorios**.
3. Instala el add-on y pulsa **Iniciar**.
4. (Opcional) Activa "Mostrar en la barra lateral" para acceder con un clic.

---

## 🤖 Bot de Telegram (opcional)

En la pestaña **Configuración** del add-on en Home Assistant:

- **telegram_token**: el token que te dio BotFather.
- **allowed_chat_ids**: lista de IDs de Telegram autorizados a usar el bot.

---

## 📂 Estructura del proyecto

- `app/main.py`: backend FastAPI con la API REST.
- `app/database.py`: SQLite con migraciones automáticas, lotes con ubicación, registro de movimientos y peso.
- `app/ocr_service.py`: OCR de tickets con preprocesado OpenCV + Tesseract.
- `app/telegram_service.py`: bot de Telegram asíncrono.
- `app/static/`: frontend en HTML, CSS y JavaScript vanilla, modularizado por pestaña (`view-*.js`).

---

## 🧪 Stack técnico

- **Backend**: Python 3, FastAPI, SQLite, Tesseract OCR, OpenCV.
- **Frontend**: HTML5, CSS y JavaScript vanilla (sin frameworks).
- **Librerías cliente**: Html5Qrcode (lectura de códigos de barras).
- **Persistencia**: todos los datos (productos, lotes, recetas, diario, plan semanal, peso, objetivos) viven en la DB del add-on. El frontend solo cachea localmente el tema visual y la lista de compra manual.

---

Creado con ❤️ para la comunidad de Home Assistant.
