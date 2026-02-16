# Estrategia de Branching para Stock Manager Addon

## Resumen

Este documento describe cómo usamos ramas en Git para mantener un desarrollo ordenado y releases funcionales para Home Assistant.

---

## Estructura de Ramas

### 1. **Rama `main`**
- **Propósito**: Versiones estables y funcionales listas para producción
- **Audiencia**: Usuarios finales que quieren stability
- **Políticas**:
  - Solo se aceptan cambios desde `develop` después de pruebas completas
  - Se crean tags/releases con versiones semánticas (v1.0.0, v1.0.1, etc.)
  - Debe estar siempre funcional y libre de bugs conocidos

### 2. **Rama `develop`**
- **Propósito**: Rama de integración y desarrollo continuo
- **Audiencia**: Home Assistant lee cambios de esta rama automáticamente
- **Políticas**:
  - Contiene las últimas características en desarrollo
  - Se pueden encontrar bugs experimentales
  - Home Assistant detecta cambios automáticamente desde aquí
  - Es la rama default para nuevas features

### 3. **Ramas de Features** (opcional pero recomendado)
- **Nombre**: `feature/descripcion-corta` (ej: `feature/add-notifications`)
- **Origen**: Basadas en `develop`
- **Destino**: Se mergean en `develop` via Pull Request

---

## Cómo Configurar Home Assistant para Usar `develop`

Home Assistant puede monitorear tu repositorio de dos formas:

### Opción A: URL Directa a Rama (Recomendado)

En Home Assistant, cuando añades el repositorio del addon, usa esta URL en lugar de la rama main:

```
https://github.com/Mixtax32/stock-manager-addon/tree/develop
```

O en tu `configuration.yaml`:
```yaml
# Si lo configuras vía YAML
homeassistant:
  # ...

# Luego en addons o custom components:
addon_repositories:
  - https://github.com/Mixtax32/stock-manager-addon/tree/develop
```

### Opción B: Usar `repository.yaml` con Rama Específica

Modifica tu `repository.yaml` en la rama `develop` para que Home Assistant lo encuentre:

```yaml
name: Stock Manager Add-ons
url: https://github.com/Mixtax32/stock-manager-addon
maintainer: Mixtax32
branch: develop  # Especifica que use la rama develop
```

---

## Flujo de Trabajo Recomendado

### Para Desarrollo de Nuevas Features:

```bash
# 1. Asegúrate de estar en develop y tener los últimos cambios
git checkout develop
git pull origin develop

# 2. Crea una rama de feature
git checkout -b feature/mi-nueva-feature

# 3. Haz tus cambios y commits
git add .
git commit -m "Agregar mi nueva feature"

# 4. Push a la rama feature
git push -u origin feature/mi-nueva-feature

# 5. Crea un Pull Request en GitHub (develop <- feature)
# Una vez aprobado y mergeado, Home Assistant detectará el cambio automáticamente
```

### Para Hacer un Release en `main`:

```bash
# 1. Asegúrate que develop está funcionando perfectamente
# (Prueba en Home Assistant si es posible)

# 2. Merge develop en main
git checkout main
git pull origin main
git merge develop

# 3. Crea un tag con versión semántica
git tag -a v1.0.0 -m "Release version 1.0.0"

# 4. Push cambios y tags
git push origin main
git push origin v1.0.0

# 5. En GitHub, crea un Release desde el tag
```

---

## Comparación Visual

```
main (Versiones estables)
 ↑
 |  (Pull Request - después de pruebas)
 |
develop (Desarrollo activo - Home Assistant lee aquí)
 ↑
 |  (Pull Request)
 |
feature/nueva-caracteristica
```

---

## Checklist para Cada Release a `main`

Antes de mergear `develop` en `main`, verifica:

- [ ] Todas las features están completas y testeadas
- [ ] No hay warnings o errores en los logs
- [ ] El addon se instala correctamente en Home Assistant
- [ ] Las funcionalidades principales funcionan as expected
- [ ] Se han actualizado versiones en `addon.json` o `build.yaml`
- [ ] Se ha actualizado el `README.md` con cambios relevantes

---

## Configuración de GitHub (Opcional pero Recomendado)

Para proteger la rama `main`, configura en GitHub:

1. Ve a: **Settings** → **Branches** → **Add rule**
2. Patrón de rama: `main`
3. Activa:
   - ✓ Require pull request reviews before merging (1 review)
   - ✓ Require status checks to pass before merging
   - ✓ Require branches to be up to date before merging
4. Haz lo mismo para `develop` (opcional)

---

## Resumen de URLs Importantes

| Rama | URL |
|------|-----|
| Main (Estable) | `https://github.com/Mixtax32/stock-manager-addon` |
| Develop (Testing) | `https://github.com/Mixtax32/stock-manager-addon/tree/develop` |
| Releases | `https://github.com/Mixtax32/stock-manager-addon/releases` |

---

## Preguntas Frecuentes

**P: ¿Home Assistant actualiza automáticamente desde develop?**
R: Sí, si lo configuras correctamente. Home Assistant chequea el repositorio periódicamente.

**P: ¿Qué pasa si tengo un bug en develop?**
R: Los usuarios que siguen `develop` lo verán. Puedes hacer un fix rápido en una rama feature y mergear a develop.

**P: ¿Puedo cambiar la versión sin hacer un release?**
R: Sí, puedes actualizar la versión en `develop` antes de hacer el release a `main`.

**P: ¿Necesito ramas feature o puedo trabajar directamente en develop?**
R: Para desarrollo simple puedes trabajar en develop, pero ramas feature son mejores para cambios complejos.

---

## Próximos Pasos

1. Asegúrate de que `develop` está actualizada con los últimos cambios
2. Configura tu Home Assistant para usar la rama `develop`
3. Prueba que Home Assistant detecte cambios cuando hagas push a `develop`
4. Usa este workflow para futuros desarrollos
