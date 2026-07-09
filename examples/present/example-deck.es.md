---
title: xFrame Present — Demo
lang: es
header: xFrame Present
---

# xFrame Present

Compila Markdown en diapositivas HTML autónomas.

Usa `→` / `←` para navegar, presiona `t` para cambiar el tema.

---

## ¿Por qué?

- Sin dependencias de tiempo de ejecución en la salida
- Archivo HTML autónomo
- Funciona sin conexión, imprime a PDF

---

## Markdown, totalmente

```ts
import { compile } from "xframe-present";

const html = compile("# Hello\n---\n# World");
```

> Todo lo que Markdown puede expresar, una diapositiva puede mostrar.

Note: menciona que las funciones de GFM como tablas y listas de tareas también funcionan.

---

## Imágenes

Un SVG inline con URI de datos (ya autónomo):

![logo de xFrame](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iIzI1NjNlYiIvPjxjaXJjbGUgY3g9IjQwMCIgY3k9IjIyNSIgcj0iMTIwIiBmaWxsPSIjNThhNmZmIi8+PHRleHQgeD0iNDAwIiB5PSIyNDAiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjU2IiBmaWxsPSIjZmZmZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj54RnJhbWU8L3RleHQ+PC9zdmc+ "click_to_zoom")

---

## Imágenes desde una URL

Un PNG regular referenciado por URL. Se incrusta como URI de datos base64 por defecto
(pasa `--no-embed-images` para conservar la URL original) para que la presentación
permanezca con capacidad offline:

![PNG vía URL](https://placehold.co/800x450/2563eb/ffffff/png?text=PNG+via+URL "click_to_zoom")

Agrega `"click_to_zoom"` como título de la imagen para que cualquier imagen sea clickeable — se abre en una luz completa. Haz clic en cualquier lugar o presiona `Esc` para cerrar.

---

## Captura de sitio web

Una captura PNG rastreada por git de un sitio en vivo. Haz clic en la imagen para abrir la página en una nueva pestaña. Actualiza el PNG con `npm run snapshot` en `ts/present/` (no en cada ejecución de CI).

@include _shared/snapshots.md#poda-home

---

## Flujo de trabajo de Present

Cómo una presentación Markdown se convierte en HTML autónomo: fragmentos compartidos y datos consolidados se resuelven en tiempo de compilación; activos PNG y SVG rastreados por git se incrustan como base64. Los scripts de mantenimiento actualizan capturas y diagramas localmente — no en cada ejecución de CI.

@include _shared/diagrams.md#present-workflow

---

## Cronogramas de proyecto

Un gráfico `timeline` sobre los datos consolidados `project`: una barra horizontal apilada por proyecto (eje Y), fechas de hitos en el eje X, con un marcador para cada evento del ciclo de vida. Pasa el cursor sobre un marcador o segmento para ver detalles. Haz clic en el nombre de un proyecto para aislar y hacer zoom en ese proyecto, o haz clic en un segmento para enfocar a todos los proyectos en esa ventana temporal (`‹ reset` restaura la vista completa).

@include _shared/graphs.md#project-timeline

---

## Volúmenes de producción

Un `timeseries` sobre los mismos datos `project`: registros anuales de producción de cada proyecto graficados por año. El `style` por métrica mezcla tipos de gráfico — aceite (`oil_kbbd`, barras) contra el eje primario (izquierda) y gas (`gas_mmscfd`, línea) contra el eje secundario (derecha) — para los tres proyectos. Pasa el cursor sobre cualquier barra o punto para ver su valor exacto.

@include _shared/graphs.md#production-timeseries

---

## Gracias

¿Preguntas?