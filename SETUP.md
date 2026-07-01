# SETUP — Cómo arrancar (guía para Daniel)

## 1. Instala Godot 4.x
1. Descarga la versión **estable** de Godot 4 (edición estándar, NO la .NET) desde https://godotengine.org/download
2. Descomprime donde quieras. Recomendado: añade el ejecutable al PATH del sistema para que Claude Code pueda lanzar `godot --headless` (si no, dile a Claude Code la ruta completa del .exe y él la anotará en CLAUDE.md).
3. Abre Godot → "Importar" → selecciona la carpeta de este proyecto (contiene `project.godot`).

## 2. Instala Claude Code
Necesitas una suscripción Claude (Pro o superior) o una cuenta de Claude Console.
- **Instrucciones oficiales** (elige instalador nativo o npm): https://code.claude.com/docs/en/quickstart
- Vía npm (requiere Node.js 18+): `npm install -g @anthropic-ai/claude-code`
- En Windows: funciona nativo o con WSL; se recomienda tener Git instalado (Git for Windows) para que Claude Code use bash.

## 3. Prepara el repositorio
Abre una terminal EN LA CARPETA de este proyecto y ejecuta:
```
git init
git add .
git commit -m "chore: kit inicial de Mistveil"
```

## 4. Primera sesión con Claude Code
1. En la terminal, dentro de la carpeta del proyecto, escribe: `claude`
2. Inicia sesión en el navegador cuando te lo pida (primera vez).
3. Pega el contenido de `prompts/PROMPT_INICIAL.md`.
4. Claude Code leerá `CLAUDE.md` automáticamente, luego `ROADMAP.md`, y empezará por la Fase 0. Aprobará contigo los cambios (o activa "aceptar todo" en la sesión si te fías).

## 5. Flujo diario
- Abre `claude` en la carpeta y escribe **/continuar** (comando personalizado incluido) — retoma donde se quedó según `ESTADO.md`.
- Prueba el juego tú mismo: abre el proyecto en Godot y pulsa F5. Tu criterio sobre el *game feel* es la parte que la IA no puede hacer: apunta qué se siente mal y díselo a Claude Code.
- Revisa `ASSETS_PENDIENTES.md` de vez en cuando: ahí Claude Code te pide arte/sonido con especificaciones exactas para que lo generes con PixelLab/Suno/ElevenLabs y lo dejes en la ruta indicada.

## 6. Consejos
- Sesiones acotadas (una fase o unas pocas tareas) rinden mejor que maratones.
- Commit frecuente = poder deshacer sin miedo. Claude Code ya lo hace por tarea.
- Si Claude Code inventa un método de Godot que no existe (pasa a veces con GDScript), el editor lo marcará: pídele que consulte la documentación oficial de esa clase y lo corrija.
- El hito crítico es la **Fase 2 (Cadencia)**: dedícale tiempo de prueba real antes de seguir. Si no es divertida ahí, el juego no lo será después.
