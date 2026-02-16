# Flujo de Trabajo Completo

## 1. Configuración Inicial (Una sola vez)

```bash
# Clonar el repositorio (si aún no lo has hecho)
git clone https://github.com/Mixtax32/stock-manager-addon.git
cd stock-manager-addon

# Asegurar que tienes las ramas principales
git fetch origin main develop
git checkout develop
git branch -vv  # Verificar que estás en develop
```

---

## 2. Ciclo de Desarrollo Diario

### Inicio del Día

```bash
# Ponte en develop
git checkout develop

# Trae los últimos cambios
git pull origin develop

# Verifica qué hay de nuevo
git log --oneline -5
```

### Durante el Desarrollo

#### Opción A: Para Cambios Simples (directamente en develop)

```bash
# Haz tus cambios en los archivos
# (edita, agrega, modifica)

# Verifica qué cambió
git status

# Prepara los cambios
git add .

# Describe lo que hiciste
git commit -m "Descripción clara del cambio"

# Sube a GitHub
git push origin develop

# Home Assistant lo detectará en 5-10 minutos ✓
```

#### Opción B: Para Cambios Complejos (usa rama feature)

```bash
# Crea una rama para tu feature
git checkout -b feature/descripcion-corta

# Haz tus cambios
# (edita, agrega, modifica)

# Commits regularmente mientras trabajas
git add .
git commit -m "Primer cambio de la feature"

git add .
git commit -m "Segundo cambio de la feature"

# Sube tu rama a GitHub
git push -u origin feature/descripcion-corta

# Crea un Pull Request en GitHub
# (O mergetea localmente)
git checkout develop
git pull origin develop
git merge feature/descripcion-corta
git push origin develop

# Home Assistant lo detectará ✓
```

### Fin del Día

```bash
# Verifica que todo esté pusheado
git status  # Debe decir "working tree clean"

# Verifica que desarrollaste en la rama correcta
git branch
git log --oneline -3
```

---

## 3. Cuando Quieres Hacer un Release (Versión Estable)

```bash
# Paso 1: Asegúrate que develop funciona perfectamente
git checkout develop
git pull origin develop

# (Prueba en Home Assistant si puedes)

# Paso 2: Actualiza la versión en los archivos
# Abre build.yaml o addon.json y cambia:
#   "version": "1.2.3"  (incrementa según cambios)

git add .
git commit -m "Bump version to 1.2.3"
git push origin develop

# Paso 3: Mergea develop a main
git checkout main
git pull origin main
git merge develop

# Paso 4: Crea un tag con la versión
git tag -a v1.2.3 -m "Release version 1.2.3"

# Paso 5: Push a ambas ramas
git push origin main
git push origin v1.2.3

# ✓ Release hecho! main ahora tiene la versión estable
```

---

## 4. Estrategia de Ramas Visualizada

```
develop (siempre con últimas features)
   ↓
   ├─ commit: "Agregar notificaciones"
   ├─ commit: "Mejorar rendimiento"
   ├─ commit: "Bump version to 1.2.3" ←─┐
   │                                     │
   ├───── merge a main────────────────────┤
   │                                     │
   └──→ main (solo versiones estables)  ←┴─ tag: v1.2.3

Usuarios que siguen develop:
- Ven cambios en 5-10 minutos
- Obtienen últimas features
- Pueden tener bugs experimentales
- Actualizaciones frecuentes

Usuarios que siguen main:
- Solo ven releases oficiales (tags)
- Siempre versión estable
- Actualizaciones menos frecuentes
- Más confiable
```

---

## 5. Gestión de Ramas Feature

### Crear una Rama Feature

```bash
git checkout -b feature/mi-caracteristica
# Estructura sugerida: feature/añadir-xxxx o feature/corregir-xxxx
```

### Ejemplos de Nombres

✓ Buenos nombres:
- `feature/add-notifications`
- `feature/improve-performance`
- `feature/fix-startup-crash`
- `feature/refactor-config-handling`

✗ Malos nombres:
- `feature/stuff`
- `feature/fix`
- `feature/changes`

### Completar una Rama Feature

```bash
# Opción 1: Mergear localmente y borrar
git checkout develop
git pull origin develop
git merge feature/mi-caracteristica
git branch -d feature/mi-caracteristica  # Borrar rama local
git push origin develop
git push origin --delete feature/mi-caracteristica  # Borrar en GitHub

# Opción 2: Usar Pull Request (recomendado en GitHub)
# Crea un PR desde feature → develop
# Revisa, aprueba, mergea en GitHub
```

---

## 6. Troubleshooting y Casos Especiales

### ¿Cometí un error antes de hacer push?

```bash
# Ver el historial
git log --oneline -10

# Si el commit está aún sin push:
git reset --soft HEAD~1     # Deshace pero mantiene cambios
# O para borrar todo:
git reset --hard HEAD~1     # Cuidado, esto borra todo

# Si ya hiciste push:
git revert HEAD  # Crea un nuevo commit que deshace el anterior
git push origin develop
```

### Necesito traer cambios de main a develop

```bash
git checkout develop
git pull origin develop
git merge main
git push origin develop
```

### Necesito ver la diferencia entre ramas

```bash
git diff develop..main          # Ver diferencias
git log develop..main --oneline # Ver commits que main tiene que develop no
```

### Trabajé en develop pero debería haber usado feature

```bash
# Crear rama feature con tus cambios actuales
git branch feature/lo-que-trabaje
git reset --hard origin/develop  # Deshace cambios en develop
git checkout feature/lo-que-trabaje
git push -u origin feature/lo-que-trabaje
# Ahora tu trabajo está en feature, develop está limpio
```

---

## 7. Checklist Semanal

- [ ] `git pull origin develop` - Traer cambios de compañeros
- [ ] Revisar `git log --oneline -20` - Ver qué se hizo
- [ ] Si hay cambios listos para release:
  - [ ] Actualizar versión
  - [ ] Mergear develop → main
  - [ ] Crear tag
  - [ ] Push everything

---

## 8. Comandos Útiles de Referencia

```bash
# Ver todas las ramas
git branch -a

# Ver en qué rama estás
git branch

# Cambiar de rama
git checkout [nombre-rama]

# Crear y cambiar de rama
git checkout -b [nombre-rama]

# Ver últimos cambios
git log --oneline -10

# Ver qué cambió en el último commit
git show HEAD

# Ver diferencias antes de commitear
git diff

# Ver diferencias staged
git diff --staged

# Deshacer cambios en un archivo
git checkout -- [archivo]

# Revertir último commit (pero mantén cambios)
git reset --soft HEAD~1

# Ver estado actual
git status

# Limpiar ramas locales borradas en GitHub
git fetch --prune
```

---

## 9. El Flujo de Home Assistant

```
Tu Push a develop
        ↓
GitHub recibe el push
        ↓
Home Assistant chequea el repo (cada 5-10 min)
        ↓
Detecta nuevo commit en develop
        ↓
Actualiza versión disponible
        ↓
Usuarios ven "Actualización disponible"
        ↓
Usuarios hacen clic en "Actualizar"
        ↓
Home Assistant descarga tu código
        ↓
Instala/ejecuta el addon ✓
```

---

## 10. Resumen: Los 3 Escenarios Más Comunes

### Escenario 1: Hiciste un cambio pequeño

```bash
git checkout develop
git pull origin develop
git add .
git commit -m "Mi cambio pequeño"
git push origin develop
```

**Tiempo**: 2 minutos
**Complejidad**: Baja
**Ejemplo**: Cambiar un valor, corregir un typo, actualizar README

---

### Escenario 2: Trabajas en una feature grande

```bash
git checkout -b feature/mi-feature
# ... trabajar por varios días ...
git push -u origin feature/mi-feature
# Crear PR, review, mergear
git checkout develop
git merge feature/mi-feature
git push origin develop
```

**Tiempo**: Variable (días)
**Complejidad**: Media
**Ejemplo**: Nueva funcionalidad, refactoring completo

---

### Escenario 3: Haces un release

```bash
# Editar versión
git add . && git commit -m "Bump version to 1.2.3" && git push
git checkout main
git merge develop && git push
git tag -a v1.2.3 -m "Release v1.2.3" && git push origin v1.2.3
```

**Tiempo**: 5 minutos
**Complejidad**: Baja (si ya testeaste)
**Ejemplo**: Cuando develop está perfecto y listo para users

---

¡Listo! Ya entiendes cómo funciona el flujo completo. 🚀
