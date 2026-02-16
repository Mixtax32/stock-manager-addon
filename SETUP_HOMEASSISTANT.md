# Configuración de Home Assistant con Rama `develop`

## Paso 1: Agregar el Repositorio a Home Assistant

### Opción A: Desde la Interfaz Web (Recomendado)

1. **Abre Home Assistant** y ve a:
   ```
   Configuración → Complementos → Tienda de complementos
   ```

2. **Haz clic en los 3 puntos** (menú) en la esquina superior derecha

3. **Selecciona "Repositorios"**

4. **Pega esta URL** y presiona Enter:
   ```
   https://github.com/Mixtax32/stock-manager-addon/tree/develop
   ```

5. **Confirma** que aparece "Stock Manager Add-ons" en tu lista de repositorios

---

### Opción B: Desde `configuration.yaml` (Alternativa)

Añade esto a tu `configuration.yaml`:

```yaml
homeassistant:
  packages:
    stock_manager: !include_dir_named packages/stock_manager

# Si usas automations u otros paquetes, asegúrate de que no hay conflictos

# Para repositorios de addons (si tu versión lo soporta):
# Consulta la documentación específica de tu versión
```

---

## Paso 2: Verificar que Home Assistant Lee de `develop`

### Opción A: Verificar la URL del Repositorio

1. En Home Assistant, ve a **Configuración → Complementos → Tienda de complementos**
2. Haz clic en "Stock Manager Add-ons"
3. Verifica que la URL muestre: `/tree/develop`

### Opción B: Verificar Cambios Detectados

1. Haz un cambio pequeño en `develop` (ej: actualiza el `README.md`)
2. Push el cambio: `git push origin develop`
3. Espera **5-10 minutos**
4. Actualiza Home Assistant (limpia caché del navegador)
5. El cambio debe ser visible en la versión disponible

---

## Paso 3: Instalación del Addon

Una vez agregado el repositorio:

1. Ve a **Configuración → Complementos → Tienda de complementos**
2. Busca **"Stock Manager"** en los resultados
3. Haz clic en el addon
4. Selecciona **"Instalar"**
5. Espera a que termine la instalación

---

## Paso 4: Configurar para Actualizaciones Automáticas (Opcional)

Si quieres que Home Assistant actualice automáticamente desde `develop`:

1. Ve a **Configuración → Complementos → Complementos instalados**
2. Busca "Stock Manager"
3. Haz clic en las 3 líneas (⋮)
4. Activa **"Actualizaciones automáticas"** (si está disponible)

---

## Estructura de Versiones en Home Assistant

Home Assistant detecta versiones basándose en los archivos de configuración del addon:

### Para Detectar una Nueva Versión:

Asegúrate de actualizar la versión en uno de estos archivos (según tu setup):

```json
// addon.json (si lo tienes)
{
  "version": "1.2.0",
  // ... resto de la config
}
```

O en:
```yaml
# build.yaml
version: 1.2.0
# ... resto de la config
```

---

## Flujo de Cambios Automáticos

```
Commit en develop
        ↓
Push a GitHub (origin/develop)
        ↓
Home Assistant chequea (cada 5-10 min)
        ↓
Detecta cambios y avisa de actualización
        ↓
Usuario descarga actualización desde Home Assistant
```

---

## Solución de Problemas

### Home Assistant no Detecta Cambios

1. **Verifica la URL**: Debe terminar con `/tree/develop`
2. **Espera 10+ minutos**: Home Assistant no actualiza instantáneamente
3. **Limpia caché**: Presiona Ctrl+Shift+Delete en el navegador
4. **Reinicia Home Assistant**: Ve a **Configuración → Sistema → Reiniciar**

### El Addon No Se Instala

1. Verifica que los archivos están en `/stock-manager/` (la estructura debe ser correcta)
2. Revisa los logs en **Configuración → Complementos → Logs**
3. Asegúrate que `manifest.json` o `addon.json` existe

### Cambios No Aparecen Después de Instalar

1. Actualiza el addon manualmente: Ve a los complementos instalados y haz clic en "Actualizar"
2. Si sigue sin funcionar, desinstala y reinstala

---

## Verificación Rápida

Para verificar que todo está configurado correctamente:

```bash
# Desde tu terminal local (en el repo)
git log --oneline develop | head -5  # Ver últimos cambios en develop
git log --oneline main | head -5     # Ver últimos cambios en main

# Verifica que develop tiene más commits que main
```

Si `develop` tiene commits que `main` no tiene, significa que tienes cambios listos para testear en Home Assistant.

---

## Próximos Pasos

- [ ] Agrega el repositorio a Home Assistant
- [ ] Verifica que se detectan cambios en `develop`
- [ ] Instala el addon desde Home Assistant
- [ ] Realiza un cambio de prueba en `develop`
- [ ] Confirma que Home Assistant detecta el cambio
