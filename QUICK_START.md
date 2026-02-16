# Guía Rápida: Workflow Git para Desarrollo

## Los Básicos en 60 Segundos

```bash
# 1. Traer los últimos cambios de develop
git checkout develop
git pull origin develop

# 2. Crear una rama para tu feature (opcional pero recomendado)
git checkout -b feature/mi-feature

# 3. Hacer cambios y commitear
git add .
git commit -m "Mi cambio"

# 4. Push a la rama (develop o feature)
git push -u origin develop
# O si usas feature:
# git push -u origin feature/mi-feature

# 5. Home Assistant detectará cambios automáticamente en 5-10 minutos
```

---

## Comandos Más Útiles

### Actualizar develop desde GitHub

```bash
git fetch origin develop
git checkout develop
git pull origin develop
```

### Ver estado de las ramas

```bash
git status                    # Estado actual
git log --oneline -10         # Últimos 10 commits
git branch -vv                # Ramas locales con tracking
```

### Crear y cambiar de rama

```bash
git checkout -b feature/nueva-caracteristica    # Crear + cambiar
git checkout develop                            # Cambiar a develop
```

### Mergear cambios a develop

```bash
git checkout develop
git pull origin develop
git merge feature/mi-feature
git push origin develop
```

### Crear un release en main

```bash
# 1. Asegúrate que develop está perfecto
git checkout develop
git pull origin develop

# 2. Mergea a main
git checkout main
git pull origin main
git merge develop

# 3. Crea un tag con la versión
git tag -a v1.2.3 -m "Release v1.2.3"

# 4. Push todo
git push origin main
git push origin v1.2.3

# 5. (Opcional) Crea un Release en GitHub
```

---

## Comparación: develop vs main

| Aspecto | develop | main |
|--------|---------|------|
| **Propósito** | Desarrollo activo | Versiones estables |
| **Estabilidad** | Puede tener bugs | Siempre funcional |
| **Home Assistant lee** | ✓ Sí | ✗ No (por default) |
| **Cambios** | Frecuentes | Solo releases |
| **Tags** | No necesarios | v1.0.0, v1.0.1, etc |

---

## El Flujo Visual

```
┌─────────────────┐
│   main (v1.0)   │
│   (Versiones)   │
└────────▲────────┘
         │
         │ (cuando está listo)
         │
┌────────┴────────┐
│    develop      │
│  (Desarrollo)   │
└────────▲────────┘
         │
         │ (merge desde feature)
         │
  ┌──────┴───────┐
  │   feature/X  │
  │  (Mi trabajo)│
  └──────────────┘
```

---

## Checklist Diario

- [ ] `git pull origin develop` - Traer últimos cambios
- [ ] Crear rama si trabajas en feature nueva
- [ ] Hacer cambios y commits regularmente
- [ ] `git push` después de cambios importantes
- [ ] Home Assistant debería detectar en 5-10 min

---

## Errores Comunes y Soluciones

### Error: "Branch 'develop' not found"

```bash
git fetch origin develop
git checkout develop
```

### Error: "Your branch is behind origin"

```bash
git pull origin develop
```

### Error: "Merge conflict"

```bash
# Resolve conflictos en los archivos
git add .
git commit -m "Merge conflict resolved"
git push origin develop
```

### Quiero deshacer últimos cambios

```bash
# Ver lo que haiciste
git log --oneline -5

# Si no hiciste push (deshaz el commit)
git reset --soft HEAD~1    # Deshace commit pero mantiene cambios
git reset --hard HEAD~1    # Deshace todo (cuidado!)
```

---

## Tips Profesionales

1. **Siempre hace pull antes de trabajar**
   ```bash
   git pull origin develop
   ```

2. **Usa mensajes de commit claros**
   ```bash
   git commit -m "Agregar sensor de temperatura"
   git commit -m "Corregir bug en inicialización"
   ```

3. **No trabajes directamente en develop para cambios grandes**
   - Usa ramas feature para cosas complejas
   - Develop solo para cambios simples

4. **Actualiza versión antes de hacer release**
   - Busca `"version"` en tus archivos
   - Incrementa según semántica: v1.0.0 → v1.0.1 o v1.1.0

5. **Espera a que Home Assistant detecte cambios**
   - No son instantáneos (5-10 minutos)
   - Puedes forzar actualización manualmente en Home Assistant

---

## Resumen del Flujo

1. **Para cada cambio pequeño**:
   ```bash
   git pull origin develop
   # hacer cambios
   git add . && git commit -m "mensaje"
   git push origin develop
   ```

2. **Para cambios complejos**:
   ```bash
   git checkout -b feature/mi-caracteristica
   # hacer cambios
   git push -u origin feature/mi-caracteristica
   # Crear PR en GitHub, mergear, listo
   ```

3. **Para releases**:
   ```bash
   # Asegúrate que develop funciona
   # Mergea develop a main
   # Crea un tag v1.x.x
   # Push todo
   ```

---

## Necesitas Más Ayuda?

- Detalles completos: Lee `BRANCHING_STRATEGY.md`
- Configurar Home Assistant: Lee `SETUP_HOMEASSISTANT.md`
- Git en general: `git help [comando]`
