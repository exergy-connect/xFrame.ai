---
name: xframe-present
description: Compiles .xp authoring documents (YAML front matter + Markdown segments) through normalized IR into HTML, PNG, and PowerPoint. Supports presentations (slidedeck, poster, readout, cover-letter), formats (desktop/tablet/mobile/poster/video), themes/styles, @layout/@region/@graph/@image/@narrative, Jinja templates, llm() / text_to_speech filters, and consolidated xFrame data. Use when building slides, decks, posters, .xp files, xframe-build, or exporting HTML/PNG/PPTX.
disable-model-invocation: true
---

# Present (xFrame)

Compile `.xp` to IR, HTML, PNG, and/or PowerPoint. Edit the `.xp` source and recompile; do not edit generated `.html` or `.xp.json`.

## Run

```bash
node skill/scripts/present.min.js <input.xp> [options]
# Cursor install:
node .cursor/skills/xframe-present/scripts/present.min.js <input.xp> [options]
```

Default outputs: IR + HTML. `.xp` must start with a closed YAML fence (`---` … `---`).

| Option | Description |
|--------|-------------|
| `--ir` `--html` `--png` `--pptx` | Outputs. If omitted, writes IR and HTML. |
| `-o, --out-dir <dir>` | Output directory (default: beside input). |
| `--presentation <name>` | `slidedeck`, `poster`, `readout`, `cover-letter`, … |
| `--format <name>` | `desktop`, `tablet`, `mobile`, `poster`, `cover-letter`, `video` |
| `--theme <name[,name...]>` | Repeatable. Built-ins: `light`, `dark`. |
| `--style <name[,name...]>` | Repeatable. |
| `--evaluation <static\|dynamic>` | Template / LLM evaluation. |
| `--positioning <static\|dynamic>` | Layout geometry. |
| `--templates <dir>` | Extra `.xpt` root. |
| `--content-plugin <module>` | Repeatable. |
| `--force-content-plugins` | Rebuild `.xframe/content-cache/`. |
| `--embed-images` | Inline local images in HTML. |
| `--llm` | Enable compile-time `llm()`. |
| `--llm-model <name>` | LLM model override. |
| `--skip-audio` | Do not run TTS; reuse existing clips. |
| `--force-audio` | Regenerate TTS. Not with `--skip-audio`. |
| `--combined-audio` | One deck TTS track. |
| `--combined-pause <seconds>` | Pause between combined-track slides (default 3). |
| `--snapshot-canvas` | PNG sized to canvas; strip chrome. |
| `--snapshot-width` / `--snapshot-height` | PNG size (default 1440×900). |
| `-h, --help` | Usage. |

`--png` requires Chrome or Chromium (`XFRAME_CHROME_PATH` if needed).

Outputs in `--out-dir` (basename = input without extension):

- `--ir` → `<base>.xp.json`
- `--html` → `<base>.<presentation>.html`
- `--png` → `<base>.<presentation>.png` or `<base>.<presentation>.<format>.png` when those names differ
- `--pptx` → `<base>.<presentation>.pptx`

Exit 0 success (`Wrote <path>` on stderr), 1 compile/I/O, 2 usage.

```bash
node skill/scripts/present.min.js deck.xp --html
node skill/scripts/present.min.js deck.xp --evaluation dynamic --theme dark --html
node skill/scripts/present.min.js flyer.xp --presentation poster --format poster --html --png
node skill/scripts/present.min.js deck.xp --pptx -o dist/
```

## Author `.xp`

```markdown
---
presentation: slidedeck
themes: [light, dark]
title: My Talk
---
@id cover
@layout cover
# Title

---
@id agenda
# Agenda

- Item
```

- Front matter: YAML between the first two `---` lines.
- Segments: split on a line that is only `---`.
- Body: GFM Markdown. `{{ … }}` is Jinja (compile-time unless `evaluation: dynamic`).

Front matter: `presentation`/`presentations` (default `slidedeck`), `format`/`formats` (default `desktop`, or `poster` for poster), `themes`/`theme`, `styles`/`style`, `title`, `subtitle`, `author`, `lang`, `layout`, `data`, `topic`, `llm`, `evaluation`, `header`, `footer`, `header-image`, `footer-image`, `narrative`.

Segment head: `@id`, `@layout <name>` (optional indented YAML), `@theme`, `@evaluation`, `@presentation`, `@format`, `@class`.

Body: `@region <name>`, `@graph` (YAML spec; needs `data`), `@image`, `@map`, `@qr-code`, `@table`, `@narrative`, `@include <path>` (relative; optional `#fragment` or `segments:` range).

```yaml
data:
  static: consolidated_data.json
```

Data paths are relative to the `.xp` file.

`{{ topic | llm("prompts/….md", cache=true) }}` needs `--llm` at compile time. Dynamic: `evaluation='dynamic'` or `--evaluation dynamic`. TTS: `@narrative` / `text_to_speech`; `--skip-audio` to skip synthesis.
