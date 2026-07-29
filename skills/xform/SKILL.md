---
name: xform
description: Compiles composable .xp semantic documents into deterministic outputs (compile-tree JSON, finalized HTML/YAML/text, multi-file artifacts). Supports Jinja concepts/templates, .json runtime bindings, .js filter modules, capability realization, and CLI overrides. Use when compiling .xp decks or labs, running the xform script, or finalizing structured documents. For authoring .xp files, use the create-xp skill.
disable-model-invocation: true
---

# xForm

Compile **structured `.xp` documents** into deterministic artifacts. Concepts,
templates, and Jinja evaluation produce a compile tree (JSON by default) or a
finalized output (`--final`).

Requires **Node.js ≥24**.

To **write or edit** `.xp` / `.xpt` sources, use the **create-xp** skill.

## When to use

- User wants to **compile** an `.xp` document, deck, lab, or framework.
- User mentions **xForm**, **xform**, compile trees, or `--final html`.
- User wants concept YAML/JSON output under `output/`.
- User wants to apply a final template (`templates/_final/<ext>.xpt`).

## How to run

**xFrame.ai layout** (this repo after publish):

```bash
node skills/xform/scripts/xform.min.js <source>... [options]
```

**Cursor install layout** (skills under `.cursor/skills/`):

```bash
node .cursor/skills/xform/scripts/xform.min.js <source>... [options]
```

**Sources:** `*.xp` documents, `*.json` concept bindings, `*.js` filter modules,
directories, or `dir/*.ext` patterns (recursive filesystem order by default).

**Default:** write the full compile tree as JSON to `output/<document>.json`.

### Options

| Option | Description |
|--------|-------------|
| `<source>...` | One or more sources (positional). |
| `-h, --help` | Show CLI help (all options) and exit. |
| `-o, --output <file>` | Override the compile-tree JSON path. |
| `--tree` | Write the full compile tree as JSON (default behavior). |
| `--final <extension>` | Apply `templates/_final/<extension>.xpt` (or `_final._templates`); write `output/<document>.<extension>`. Segment-stream finals write each segment's `_document._output` under `output/`. |
| `--with name=value` | Override a root-scope variable (repeatable; supports `company.name=X`). |
| `--env name` | Include an OS environment variable in root scope (repeatable). |
| `--keep-segment-separators` | With `--final`, join segments with `---` (default: blank line). |
| `--no-recurse` | Do not recurse into subdirectories when expanding dirs/patterns. |
| `--skip-symlinks` | Do not follow or include symlinks when expanding dirs/patterns. |
| `--target <capability>` | Realize this capability path (overrides `_document._target`). |
| `--executor <name>` | Prefer a named capability executor. |
| `--no-execute` | Emit the `_execution` plan only (do not realize / run commands). |
| `--dryrun` | Print `_command` lines without spawning. |
| `--approval <hash\|interactive>` | Approve an execution hash, or prompt Y/N (TTY). |
| `--auto-approve` | Run capability commands without approval. |
| `--approve-any-version` | Omit `_version` from approval hashes. |
| `--approval-store <path>` | Override approval store root (default `~/.xform/approvals/`). |
| `--watch` | Rebuild on input/template changes. |

### Jinja-only compile

```bash
node skills/xform/scripts/xform.min.js compile <template> [runtime.json ...] [filters.js ...] [--final] [-o output]
```

### Examples

```bash
# Compile tree JSON
node skills/xform/scripts/xform.min.js deck.xp

# Final HTML
node skills/xform/scripts/xform.min.js deck.xp --final html

# Bindings + filters
node skills/xform/scripts/xform.min.js deck.xp runtime.json filters.js --final html -o out/deck.html
```

## GitHub Action

```yaml
- uses: exergy-connect/xFrame.ai/actions/xform@main
  with:
    sources: path/to/document.xp
    materialization: html
```

## Directory layout

- `skills/xform/SKILL.md` — this skill (compile / CLI)
- `skills/xform/scripts/xform.min.js` — minified CLI bundle (Node ESM)
- `skills/create-xp/SKILL.md` — authoring `.xp` documents
