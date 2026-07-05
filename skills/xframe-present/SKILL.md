---
name: xframe-present
description: Compiles a Markdown presentation deck into HTML slides with generated CSS (presentation.css, optional locale/custom overrides), embedded or linked styles, offline JS, and PDF printing. Supports front matter (title/theme/author/style), slide separators, speaker notes, locale decks, and CLI overrides. Use when building slides, customizing presentation.css or presentation.custom.css, or running the present script.
disable-model-invocation: true
---

# Present (xFrame)

Compile a **Markdown deck** into **HTML slides**. CSS and JavaScript are embedded
by default (offline-friendly); `--no-embed` links external stylesheets instead.
Prints cleanly to PDF (one slide per page). Companion tool to **xframe-consolidate**.

## When to use

- User wants to **build slides** / a **presentation** / a **slideshow** from Markdown.
- User mentions **xframe-present**, a **deck**, **slides**, or turning **Markdown into HTML slides**.
- User wants to **customize slide colors**, **`presentation.css`**, or **`presentation.custom.css`**.
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
| `--skip-locales` | Compile only the requested deck. By default, compiling the base deck (`deck.md`) also compiles every locale sibling (`deck.cz.md`, …) into the same output directory. |
| `--no-embed-images` | By default, images are inlined as base64 and CSS is embedded in HTML. Pass this flag (alias **`--no-embed`**) to keep original image `src` values and link **`presentation.css`** (+ locale/custom CSS when present) instead of inlining. CSS files are always written beside the HTML output. |
| `--no-embed` | Alias for `--no-embed-images`. |
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

- **Front matter** (optional): a block delimited by lines containing only `---` at the very top of the file, with `key: value` pairs and an optional nested **`style:`** block. Recognized keys: `title`, `theme`, `author`, `style`, `header`, `header-image`, `header-image-alt`, `header-image-align`, `footer`, `footer-image`, `footer-image-alt`, `data`, `lang`.
- **Header / footer layout** (optional): set `header` and/or `footer` in the front matter to give every slide a consistent framed layout — a **10%** header band (slide's own title on the left, the `header` text on the right), an **80%** content area, and a **10%** footer band (the `footer` text on the left, the slide number `n / total` on the right). The slide's first heading is lifted into the header band so it isn't duplicated in the body. Optional **`header-image`** (path to a git-tracked PNG/SVG) renders a logo and is embedded at compile time; **`header-image-alt`** sets the `<img alt>`; **`header-image-align`** (`left` or `right`, default `right`) places the logo on the left band or left of the header text on the right. Optional **`footer-image`** renders a logo left of the footer text and is embedded at compile time; **`footer-image-alt`** sets the `<img alt>`. If `header`, `footer`, `header-image`, and `footer-image` are all unset, slides use the default full-bleed layout.
- **Slides** are separated by a line containing only `---` (three or more dashes). Empty slides are dropped.
- **Speaker notes**: a line starting with `Note:` marks the rest of the slide as notes; they are embedded as an HTML comment, not shown on the slide.
- **Column layout** (optional): put `@layout columns=N [ratio=w1/w2/…] [vertical-align=top|center|bottom] [horizontal-align=left|center|right]` anywhere in the slide body (after the heading, which is lifted into the header band when framed). Separate column content with `@column [vertical-align=top|center|bottom] [horizontal-align=left|center|right]` on its own line — attributes apply to the column that **follows** the marker. Content above the `@layout columns=…` line is included in the first column. Default vertical and horizontal alignment is **`center`** for both `@layout` and each column. Example — two columns with a 0.9 / 1.25 width ratio:

  ```markdown
  ## Slide title

  @layout columns=2 ratio=0.9/1.25 vertical-align=center horizontal-align=center

  Left column markdown…

  @column vertical-align=top horizontal-align=left

  Right column markdown…
  ```

  `ratio` is optional (defaults to equal columns). The number of `@column`-delimited sections must match `columns`. Column CSS is embedded only when a deck uses `@layout`.
- **Slide-body alignment** (default): slides **without** any `@layout columns=…` line center the content block vertically and horizontally in the body (`vertical-align: center`, `horizontal-align: center`). Text and bullets remain left-aligned inside the block. Images are centered within the block. Override with `@layout vertical-align=top|center|bottom horizontal-align=left|center|right` anywhere in the slide body (no `columns=` required). Alignment positions the `.fit` block — never `text-align: center` on prose or lists. Column layouts keep their own alignment rules.
- **Cover layout** (optional): put `@layout cover` anywhere in the slide body (after the heading, when framed). The slide uses a full-bleed body with no header/footer bands; content fills the slide area and **auto-fit scaling is skipped** (including in print/PDF). Use for title slides or other author-designed full-page layouts. Style the root element with `height: 100%` and flex/grid so content stays within the slide. Example:

  ```markdown
  # Quarterly Review

  @layout cover

  <div class="title-cover">…</div>
  ```
- **Includes**: an `@include` directive on its own line inlines another file before slides are split. Paths resolve relative to the including file. Use `@include path/to/file.md#fragment-id` to pull a named fragment from a registry file (`<!-- @fragment id -->` … `<!-- @end -->`). Includes are recursive; missing files, missing fragments, and circular includes fail the build. Useful for sharing graph specs across locale-specific decks.
- **Locale decks**: sibling files `{base}.md` and `{base}.{locale}.md` in the same directory are auto-detected; when two or more exist, a language switcher appears in the HUD (preserves `#slide` hash). Set front-matter `lang` for `<html lang="…">`. Compiling the **base** deck also compiles all locale siblings unless **`--skip-locales`** is passed. Branding fields (`theme`, `footer`, `header-image`, `data`, etc.) inherit from the base deck when omitted — locale files typically only need `title`, `lang`, and translated slide content. CSS is shared from the base deck — see **Styling & CSS**.
- **Website snapshots**: `xframe-snapshot` fenced JSON with required `url` and git-tracked `image` (PNG path). Renders a clickable thumbnail that opens the URL in a new tab; PNG is embedded like any image. Refresh PNGs with `npm run snapshot -- <deck.md>` in `ts/present/` (Playwright maintainer script, not bundled). CI compiles only — does not re-capture.
- **Mermaid diagrams**: `xframe-mermaid` fenced JSON with required `image` (SVG path) and exactly one of `source` (`.mmd` file) or `diagram` (inline text). Renders an embedded SVG diagram, click-to-zoom by default. Refresh SVGs with `npm run mermaid -- <deck.md>` in `ts/present/` (`@mermaid-js/mermaid-cli` maintainer script, not bundled). CI compiles only — does not re-render.
- **Image galleries**: `xframe-gallery` fenced JSON with `"layout": "primary"`, a `primary` image object, and a non-empty `support` array. Renders one dominant image above a row of supporting thumbnails; the support column count follows `support.length`. Each image entry is `{ "src": <path>, "alt": <text>, "zoom": <bool> }`; `zoom` defaults to `true` (click-to-zoom lightbox). Image paths resolve relative to the deck directory and must exist at compile time.

  ````markdown
  ```xframe-gallery
  {
    "layout": "primary",
    "primary": {
      "src": "graphs/portfolio.png",
      "alt": "Recurring pattern across the portfolio"
    },
    "support": [
      { "src": "graphs/asset-a.png", "alt": "Asset A" },
      { "src": "graphs/asset-b.png", "alt": "Asset B" }
    ]
  }
  ```
  ````

- **Local HTML embeds**: `xframe-embed` fenced JSON with required `src` (git-tracked HTML path relative to the deck). Inlines the fragment into a sandboxed iframe (`srcdoc`) at compile time for offline interactive slides. On framed slides, use the slide heading as the title — do not repeat it in the body or embed spec. Requires `filePath` when compiling.

  ````markdown
  ## Partner Network

  ```xframe-embed
  { "src": "widgets/network.html" }
  ```
  ````

- Slide bodies are rendered as **GitHub-Flavored Markdown** (headings, lists, code blocks, tables, blockquotes, images, links).
- **Click-to-zoom images** (opt-in per image, default off): set an image's Markdown title to `click_to_zoom` to make it clickable — it opens in a full-screen lightbox. Click anywhere or press `Esc` to close.

  ```markdown
  ![Architecture diagram](diagram.png "click_to_zoom")
  ```

  Images without the marker render normally, and a normal title (e.g. `"A caption"`) is kept as-is. The lightbox styles/script are only embedded when a deck has at least one zoomable image, mermaid diagram, or gallery image with `zoom` enabled (default on).

## Styling & CSS

Compile produces CSS artifacts beside the HTML output. Agents editing decks should follow this model.

### Output files (in the HTML output directory)

| File | Generated? | Source | Included in |
|------|------------|--------|-------------|
| `presentation.css` | Yes, every compile | Base deck templates + base `style` front matter | All locale HTML files |
| `presentation.{locale}.css` | Yes, when locale deck has `style` | Locale deck `style` only (e.g. `presentation.cz.css`) | That locale's HTML only |
| `presentation.custom.css` | No — user-authored | Deck source directory | All HTML (after generated CSS) |

### Cascade order (lowest → highest priority)

1. `presentation.css` — shared baseline (templates + base deck colors)
2. `presentation.{locale}.css` — locale color overrides (if present)
3. `presentation.custom.css` — free-form CSS overrides (if present)

### Where to put styling changes

| Goal | Agent action |
|------|--------------|
| Brand colors for entire deck family | Add `style:` block to **base** `{base}.md` |
| Locale-specific color tweak | Add `style:` block to **`{base}.{locale}.md`** only |
| Arbitrary CSS (fonts, layout, selectors) | Create/edit **`presentation.custom.css`** next to deck `.md` files |
| Visual color picking (best UX) | Edit colors in **`presentation.custom.css`** or front-matter `style:` with VS Code picker (see below) |
| Do NOT edit | `presentation.css` (regenerated each compile; changes lost) |

### Front-matter `style` block (nested YAML-style indent)

Supported keys map to CSS variables: `primary_color` → `--accent`, `background_color` → `--bg`, `slide_background` → `--slide-bg`, `text_color` → `--fg`, `muted_color` → `--muted`, `border_color` → `--border`, `code_background` → `--code-bg`. Optional nested `light:` / `dark:` for per-theme values.

Example (base deck):

```yaml
---
style:
  primary_color: "#2563eb"
  dark:
    primary_color: "#58a6ff"
---
```

Example (Czech locale override — in `deck.cz.md` front matter only):

```yaml
style:
  primary_color: "#dc2626"
```

### Color picker (VS Code / Cursor)

**Best UX — `presentation.custom.css`:** Open the file; click the color swatch in
the gutter next to `#`, `rgb()`, or `hsl()` values. Override template variables:
`--accent`, `--bg`, `--slide-bg`, `--fg`, `--muted`, `--border`, `--code-bg`.

**Front-matter `style:` — schema-assisted picker:** The xFrame repo includes
`.vscode/schemas/deck-frontmatter.schema.json` mapping `primary_color`, etc. to
`format: color`. Requires the **YAML** extension (`redhat.vscode-yaml`, recommended
in `.vscode/extensions.json`). Default schema globs: `ts/present/examples/**/*.md`,
`**/*.deck.md`. Add user deck paths to `yaml.schemas` in `.vscode/settings.json`.
Use quoted hex: `primary_color: "#2563eb"`. If swatches are missing, temporarily
set language mode to YAML for the front-matter block.

When suggesting colors to the user, prefer creating/updating
`presentation.custom.css` for full picker support, or `style:` keys when they want
colors in front matter / locale-specific CSS files.

### Locale decks & CSS

- Template modules (zoom, graph, layout, …) are determined by the **base** deck content.
- All locales share `presentation.css`.
- `deck.html` never loads `presentation.{locale}.css`.
- `deck.cz.html` loads `presentation.cz.css` only if `deck.cz.md` defines `style`.
- Put shared graph/mermaid specs in `@include` fragments or the base deck.

### Embed vs external CSS (default: embed)

Default: CSS inlined in HTML `<style>` blocks; files still written to output dir.
`--no-embed` / `--no-embed-images`: HTML uses `<link rel="stylesheet">` to `presentation.css` (and locale/custom files when present); images also keep original `src`.

### Typical source layout (agent reference)

```
my-talk/
  deck.md                      ← base deck + style for shared colors
  deck.cz.md                   ← optional locale style → presentation.cz.css
  presentation.custom.css      ← optional; never overwritten by compile
  output/
    deck.html
    deck.cz.html
    presentation.css           ← generated
    presentation.cz.css        ← generated when deck.cz.md has style
```

### Agent pitfalls

- Never hand-edit `presentation.css` — use `style` front matter or `presentation.custom.css`.
- Locale `style` does not affect template modules — only color variable overrides.
- Recompiling a locale without `style` leaves a stale `presentation.{locale}.css` on disk (harmless; optional cleanup).

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
