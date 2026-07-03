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

- **Front matter** (optional): a block delimited by lines containing only `---` at the very top of the file, with simple `key: value` pairs. Recognized keys: `title`, `theme`, `author`.
- **Slides** are separated by a line containing only `---` (three or more dashes). Empty slides are dropped.
- **Speaker notes**: a line starting with `Note:` marks the rest of the slide as notes; they are embedded as an HTML comment, not shown on the slide.
- Slide bodies are rendered as **GitHub-Flavored Markdown** (headings, lists, code blocks, tables, blockquotes, images, links).

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
