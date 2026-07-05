---
name: xframe-present
description: Compiles a Markdown presentation deck into a single self-contained HTML slideshow (embedded CSS + JS, works offline, prints to PDF). Supports YAML-style front matter (title/theme/author), `---` slide separators, `Note:` speaker notes, light/dark themes, keyboard navigation, and CLI overrides. Use when the user wants to build slides, turn Markdown into a presentation, generate an HTML deck, or run the present script.
disable-model-invocation: true
---

# Present (xFrame)

Compile a **Markdown deck** into one **standalone HTML file**. All CSS and JavaScript are embedded, so the output opens in any browser with no network access or build step, and prints cleanly to PDF (one slide per page). Companion tool to **xframe-consolidate**.

## When to use

- User wants to **build slides** / a **presentation** / a **slideshow** from Markdown.
- User mentions **xframe-present**, a **deck**, **slides**, or turning **Markdown into HTML slides**.
- User has a `.md` file with `---` slide separators and wants a viewable HTML deck.
- User wants a **self-contained**, offline, printable presentation artifact.

## How to run

From the repo root, with Node (ESM, Node ≥18). The input is a Markdown deck file; the output is a single HTML file.

**xFrame layout (this repo):**

```bash
node skills/xframe-present/scripts/present.min.js <input.md> [options]
```

**Cursor install layout** (skills under `.cursor/skills/`):

```bash
node .cursor/skills/xframe-present/scripts/present.min.js <input.md> [options]
```

**Required:**

| Argument | Description |
|----------|-------------|
| `<input.md>` | Path to the Markdown deck file (positional). |

**Optional:**

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Output HTML path. Default: the input path with its extension replaced by `.html`. Parent directories are created if missing. |
| `-t, --title <title>` | Deck title (used in `<title>`). Overrides front-matter `title`. |
| `--author <name>` | Author metadata (`<meta name="author">`). Overrides front-matter `author`. |
| `--theme <name>` | Visual theme: `light` or `dark`. Overrides front-matter `theme`. Invalid values exit non-zero. |
| `--data <url>` | URL or local path to a consolidated xFrame JSON data file. Overrides front-matter `data`. See **Consolidated data & graphs** below. |
| `--no-embed-images` | Disable image embedding. By **default**, images are inlined as base64 `data:` URIs for a fully self-contained deck: `http(s)://` images are fetched and local paths (relative to the deck's directory) are read; `data:` URIs are left as-is, and unreachable images are warned about and left with their original `src`. Use this flag to keep original `src` values instead. |
| `-h, --help` | Show usage. |

## Deck format

```markdown
---
title: My Talk
theme: dark
author: Ada Lovelace
---

# First slide

Some **Markdown** content.

---

## Second slide

- bullet one
- bullet two

Note: these are speaker notes (kept out of the visible slide)
```

- **Front matter** (optional): a block delimited by lines containing only `---` at the very top of the file, with simple `key: value` pairs. Recognized keys: `title`, `theme`, `author`, `header`, `footer`, `data`.
- **Header / footer layout** (optional): set `header` and/or `footer` in the front matter to give every slide a consistent framed layout — a **10%** header band (slide's own title on the left, the `header` text on the right), an **80%** content area, and a **10%** footer band (the `footer` text on the left, the slide number `n / total` on the right). The slide's first heading is lifted into the header band so it isn't duplicated in the body. If neither is set, slides use the default full-bleed layout.
- **Slides** are separated by a line containing only `---` (three or more dashes). Empty slides are dropped.
- **Speaker notes**: a line starting with `Note:` marks the rest of the slide as notes; they are embedded as an HTML comment, not shown on the slide.
- **Includes**: an `@include` directive on its own line inlines another file before slides are split. Paths resolve relative to the including file. Use `@include path/to/file.md#fragment-id` to pull a named fragment from a registry file (`<!-- @fragment id -->` … `<!-- @end -->`). Includes are recursive; missing files, missing fragments, and circular includes fail the build. Useful for sharing graph specs across locale-specific decks.
- Slide bodies are rendered as **GitHub-Flavored Markdown** (headings, lists, code blocks, tables, blockquotes, images, links).
- **Click-to-zoom images** (opt-in per image, default off): set an image's Markdown title to `click_to_zoom` to make it clickable — it opens in a full-screen lightbox. Click anywhere or press `Esc` to close.

  ```markdown
  ![Architecture diagram](diagram.png "click_to_zoom")
  ```

  Images without the marker render normally, and a normal title (e.g. `"A caption"`) is kept as-is. The lightbox styles/script are only embedded when a deck has at least one zoomable image.

## Consolidated data & graphs

A deck can be bound to a **consolidated xFrame JSON data** file (the output of **xframe-consolidate**, e.g. `output/consolidated_data.json`) and draw interactive graphs from it.

### Binding data

Set the `data` front-matter key (or pass `--data`) to a URL or local path. Local paths resolve relative to the deck's directory; `http(s)://` URLs are fetched at compile time.

```markdown
---
title: Portfolio Review
header: xFrame Present
footer: © Example LLC
data: ../../consolidate/examples/output/consolidated_data.json
---
```

- The whole consolidated document is resolved and kept intact; it is embedded once in the output for client-side graphs.
- The **first slide's footer** automatically shows the data provenance as `<model name> · v<version> · <timestamp>` (from the document's `model.name`, `version`, and `timestamp`).
- If the data can't be read/fetched, a warning is printed and the deck still compiles (no footer provenance, empty graphs).

### Graph slides

Add a graph with a fenced code block whose info string is **`xframe-graph`**; the block body is a **JSON spec**. It is validated at compile time and rendered client-side as dependency-free inline SVG against the bound data. Graph styles/script are only embedded when a deck contains at least one graph.

````markdown
## Project timelines

```xframe-graph
{
  "type": "timeline",
  "title": "Subsea tieback lifecycles",
  "entity": "project",
  "rowLabel": "name",
  "barSize": "budget",
  "events": {
    "path": "milestones",
    "date": "date",
    "category": "milestone_key.phase"
  },
  "categories": ["discovery", "appraisal", "FID", "first_oil", "end_of_life"]
}
```
````

Spec fields:

| Field | Description |
|-------|-------------|
| `type` | Graph type: **`timeline`** or **`timeseries`**. |
| `title` | Optional graph title. |
| `entity` | Entity to plot; rows come from `data.<entity>` in the consolidated document (one row per record). |

**`timeline`** fields:

| Field | Description |
|-------|-------------|
| `rowLabel` | Field path on each record used as the Y-axis row label. |
| `sort` | Row order: `timeline` (default, by earliest event date) or `alphabetical` (by `rowLabel`). |
| `barSize` | Optional numeric field path; scales each bar's thickness (and its markers) across rows (e.g. `budget`). |
| `rowDetails` | Optional list of field paths shown as a tooltip when hovering the row label (e.g. `["partners"]`); arrays/nested objects are summarized. |
| `events.path` | Array field on each record holding the dated events (e.g. `milestones`). |
| `events.date` | Field path on each event with a date (`YYYY-MM-DD`). |
| `events.category` | Field path on each event for its category; **dotted paths** work (e.g. `milestone_key.phase` for a composite-key subfield). |
| `categories` | Optional ordered category list; fixes legend order and color assignment. |

The **`timeline`** type draws one horizontal stacked bar per row (Y axis = `rowLabel`), placing each event by its date along a shared X axis with year gridlines. Segments between consecutive events are colored by the earlier event's category, every event gets a marker, and hovering a segment, marker or bar shows details. **Clicking a row label** isolates that row and zooms the X axis to its date range; **clicking a segment** focuses every row on that segment's time window. The `‹ reset` control (shown while a selection/focus is active) restores the full view. A `data` binding is required for graphs to have something to render.

**`timeseries`** fields:

| Field | Description |
|-------|-------------|
| `seriesLabel` | Field path on each record used as the series name (one series per record, colored from the palette). |
| `points.path` | Array field on each record holding the per-point records (e.g. `production`). |
| `points.x` | Field path on each point for the X value (e.g. `production_key.year`; dotted paths work). |
| `points.y` | Ordered list of metrics, each `{ "field": <path>, "axis": "primary" \| "secondary", "label": <text>, "style": "line" \| "bar" }`. `style` defaults to `line`. |
| `axes` | Optional axis titles: `{ "primary": { "label": … }, "secondary": { "label": … } }`. |

The **`timeseries`** type draws a multi-series chart. Each entity row is one series (one palette color); each `points.y` metric is drawn in its own `style` — **`line`** (solid on the primary/left axis, dashed on the secondary/right axis) or **`bar`** — so *rows × metrics* series are drawn (e.g. 3 projects × {oil, gas} = 6 series). Bars sharing an X value are grouped side by side. Missing metric values are skipped; hovering a point or bar shows its series, X value and metric value.

```xframe-graph
{
  "type": "timeseries",
  "title": "Annual oil & gas production",
  "entity": "project",
  "seriesLabel": "name",
  "points": {
    "path": "production",
    "x": "production_key.year",
    "y": [
      { "field": "oil_kbbd", "axis": "primary", "label": "Oil (kbbd)", "style": "bar" },
      { "field": "gas_mmscfd", "axis": "secondary", "label": "Gas (MMscfd)", "style": "line" }
    ]
  },
  "axes": {
    "primary": { "label": "Oil (kbbd)" },
    "secondary": { "label": "Gas (MMscfd)" }
  }
}
```

## Viewing the output

Open the generated HTML in a browser:

| Key | Action |
|-----|--------|
| `→` / `Space` / `PageDown` | Next slide |
| `←` / `PageUp` | Previous slide |
| `Home` / `End` | First / last slide |
| `t` | Toggle light/dark theme |
| `Ctrl`/`Cmd` + `P` | Print all slides (one per page) to PDF |

The URL hash (e.g. `#3`) tracks the current slide for deep links, and a progress bar plus a slide counter are shown.

## Example

```bash
node skills/xframe-present/scripts/present.min.js deck.md \
  --output slides.html --theme dark --title "Quarterly Review"
```

## Errors

- Missing input file → exit 1.
- Invalid `--theme` (not `light`/`dark`) or unknown option → exit 2.
- No input file and no `--help` → usage printed, exit 2.
- Success → exit 0; output path logged (`Wrote <path>`).
