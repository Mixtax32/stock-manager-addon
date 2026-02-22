# Stock Manager - Home Assistant Add-on

Sistema completo de gestión de inventario doméstico con escáner de códigos de barras.

## Características

- 📷 **Escáner de códigos de barras** - Usa la cámara del móvil para escanear productos
- 📦 **Gestión de inventario** - Control completo de stock con categorías
- 🛒 **Lista de compras automática** - Genera listas basadas en stock mínimo
- 📊 **Estadísticas en tiempo real** - Visualiza tu inventario de un vistazo
- 💾 **Base de datos SQLite** - Datos persistentes y confiables
- 🔄 **API REST** - Backend robusto con FastAPI
- 📱 **Responsive** - Funciona en móvil, tablet y ordenador

## Instalación

### Opción 1: Instalación local (desarrollo)

1. Copia la carpeta `stock-manager` a `/addons/` en tu Home Assistant
2. Ve a **Configuración** → **Complementos**
3. Click en **"Tienda de complementos"** → **⋮** (tres puntos) → **"Repositorios"**
4. Añade: `/addons/stock-manager`
5. Busca "Stock Manager" en la lista
6. Instalar

### Opción 2: Instalación desde repositorio (futura)

1. Añade este repositorio a HACS o a complementos personalizados
2. Instala "Stock Manager"
3. Inicia el add-on
4. Accede desde el menú lateral

## Configuración

El add-on no requiere configuración adicional. Los datos se guardan automáticamente en `/data/stock_manager/stock.db`.

### Opciones disponibles

- **log_level**: Nivel de logging (debug, info, warning, error)

## Uso

### Añadir productos

1. Ve a la pestaña "Escanear"
2. Escanea el código de barras o introdúcelo manualmente
3. Rellena nombre, categoría y stock mínimo
4. Click en "Añadir"

### Gestionar stock

- **Botones +1/-1**: Ajustes rápidos desde la lista de productos
- **Escanear y consumir**: Escanea y resta unidades
- **Lista de compras**: Se genera automáticamente con productos bajo stock mínimo

## API REST

El add-on expone una API REST completa:

### Endpoints

- `GET /api/products` - Listar todos los productos
- `GET /api/products/{barcode}` - Obtener producto específico
- `POST /api/products` - Crear producto nuevo
- `PATCH /api/products/{barcode}` - Actualizar producto
- `POST /api/products/{barcode}/stock` - Actualizar stock
- `DELETE /api/products/{barcode}` - Eliminar producto
- `GET /api/products/low-stock/list` - Productos con stock bajo
- `GET /api/stats` - Estadísticas del inventario

### Ejemplo de uso

```bash
# Obtener todos los productos
curl http://homeassistant.local:8099/api/products

# Añadir stock
curl -X POST http://homeassistant.local:8099/api/products/123456/stock \
  -H "Content-Type: application/json" \
  -d '{"quantity": 5}'
```

## Integración con Home Assistant

Puedes crear automatizaciones basadas en la API:

```yaml
automation:
  - alias: "Notificar stock bajo"
    trigger:
      - platform: time
        at: "09:00:00"
    action:
      - service: rest_command.check_stock
      - condition: template
        value_template: "{{ states('sensor.stock_low_count') | int > 0 }}"
      - service: notify.mobile_app
        data:
          message: "Tienes {{ states('sensor.stock_low_count') }} productos con stock bajo"
```

## Desarrollo

### Estructura del proyecto

```
stock-manager/
├── config.yaml           # Configuración del add-on
├── Dockerfile           # Imagen Docker
├── run.sh              # Script de inicio
├── requirements.txt    # Dependencias Python
├── app/
│   ├── main.py            # Backend FastAPI
│   ├── database.py        # Gestión SQLite
│   ├── models.py          # Modelos de datos
│   ├── barcode_service.py # Lógica de códigos de barras
│   ├── ocr_service.py     # Lógica de OCR (reconocimiento de texto)
│   └── static/
│       ├── index.html     # Estructura del frontend
│       ├── styles.css     # Estilos modernos (UI/UX)
│       └── app.js         # Lógica interactiva del frontend
└── README.md
```

### Tecnologías

- **Backend**: Python + FastAPI + SQLite
- **Frontend**: HTML + CSS + JavaScript
- **Escáner**: html5-qrcode library

## Soporte

Para bugs o sugerencias, abre un issue en GitHub.

## Licencia

MIT License

## Autor

Creado con ❤️ para la comunidad de Home Assistant