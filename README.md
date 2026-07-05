# xFrame.ai

Public repository of **Cursor agent skills** for [xFrame](https://github.com/exergy-connect/xFrame): model-driven data consolidation and related workflows.

**Live demo:** [xFrame Present example deck](https://exergy-connect.github.io/xFrame.ai/examples/present/example-deck.html#1) — subsea tieback portfolio slides with consolidated-data graphs.

## Skills

| Skill | Description |
| --- | --- |
| **xframe-model** | Model authoring and schema guidance for xFrame. |
| **xframe-consolidate** | Normalize and consolidate JSON model and data into validated JSON Schema plus consolidated data (optional JS output). Run from the command line or let the agent consolidate when you ask to validate model/data. |
| **xframe-present** | Compile a Markdown deck into a single self-contained HTML slideshow (offline-capable, printable to PDF). Supports consolidated-data graphs and click-to-zoom images. |
| **xframe-code** | Program-structure schema (packages, classes, methods, fields) using the xYang JSON Schema profile. Manual install only (see below). |

## Install (Cursor)

### Install script (recommended)

Run from your project root:

```bash
bash <(curl -fsSL https://exergy-connect.github.io/xFrame.ai/install-skills.sh)
```

Installs **xframe-model**, **xframe-consolidate**, and **xframe-present** into `.cursor/skills/` and records the suite version.

### Check for updates

```bash
bash <(curl -fsSL https://exergy-connect.github.io/xFrame.ai/install-skills.sh) --check
```

### Update

Re-run the install script. Existing skills are replaced with the latest version.

### Manual install

```bash
mkdir -p .cursor/skills
cp -r path/to/xFrame.ai/skills/xframe-model .cursor/skills/
cp -r path/to/xFrame.ai/skills/xframe-consolidate .cursor/skills/
cp -r path/to/xFrame.ai/skills/xframe-present .cursor/skills/
# optional:
cp -r path/to/xFrame.ai/skills/xframe-code .cursor/skills/
```

## Examples

End-to-end sample under [`examples/`](examples/):

| Path | Description |
| --- | --- |
| [`examples/consolidate/`](examples/consolidate/) | Subsea tieback portfolio — JSON model, sample data, and consolidated output. See [README](examples/consolidate/README.md) for entity layout and how to run the consolidator. |
| [`examples/present/`](examples/present/) | Demo slide deck (`example-deck.md` → `example-deck.html`) bound to the consolidated data, with timeline and timeseries graphs. |

CI on `main` keeps generated artifacts fresh via [`.github/workflows/examples-ci.yml`](.github/workflows/examples-ci.yml): consolidate, compile the deck, and commit once.

## GitHub Pages

The live site ([exergy-connect.github.io/xFrame.ai](https://exergy-connect.github.io/xFrame.ai)) is published from [`docs/`](docs/) only. Pushes that touch other paths (skills sync, action metadata, README, and so on) do not trigger a Pages rebuild. CI copies the compiled demo deck into `docs/examples/present/` when it changes.

| Path under `docs/` | Served URL |
| --- | --- |
| `install-skills.sh` | `/install-skills.sh` |
| `latest` | `/latest` |
| `examples/present/example-deck.html` | `/examples/present/example-deck.html` |
| `goa_field_of_dreams.html` | `/goa_field_of_dreams.html` |
| `LICENSE` | `/LICENSE` |

## GitHub Actions

This repo publishes two **composite** actions that wrap the bundled minified scripts under `skills/`. **Node.js ≥18** is required on the job runner (`ubuntu-latest` includes a suitable Node). Pin a branch, tag, or SHA (for example `@main`).

| Action | `uses` | Script |
| --- | --- | --- |
| [**xFrame consolidate**](action.yml) | `exergy-connect/xFrame.ai@main` | `skills/xframe-consolidate/scripts/consolidate.min.js` |
| [**xFrame present**](present/action.yml) | `exergy-connect/xFrame.ai/present@main` | `skills/xframe-present/scripts/present.min.js` |

[`.github/workflows/examples-ci.yml`](.github/workflows/examples-ci.yml) uses these published refs and is intended as a copyable template.

### xFrame consolidate

Expects **JSON** model fragments and entity data under **`<working-dir>/data`** and **`<working-dir>/model`** (same contract as the [xframe-consolidate](skills/xframe-consolidate/SKILL.md) skill). Writes to **`<working-dir>/output`**.

```yaml
on:
  push:
    branches: [main]

jobs:
  consolidate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: exergy-connect/xFrame.ai@main
        with:
          working-dir: examples/consolidate
          note: 'Reconsolidate after model or data change'
          clean: 'true'
```

#### Inputs

| Input | Required | Description |
| --- | --- | --- |
| `note` | yes | Non-empty change note stored in consolidated metadata. |
| `working-dir` | no | Project root with `data/` and `model/` subdirs (default `xframe`). |
| `author` | no | Change author; if omitted, `GITHUB_ACTOR` is used. |
| `git-commit-hash` | no | Commit on the change record; if omitted, `GITHUB_SHA` is used. |
| `log-level` | no | `DEBUG`, `INFO`, `WARNING`, or `ERROR`. |
| `js` | no | Set to `true` to pass `--js` (boolean inputs are strings `true` / `false`). |
| `clean` | no | Set to `true` to pass `--clean`. |
| `close-fk-enums` | no | Set to `true` to pass `--close-fk-enums`. |

#### Outputs

**`consolidated.schema.json`**, **`consolidated_data.json`**, and logs under **`<working-dir>/output/`** (optional `.js` artifacts when `js: true`).

### xFrame present

Compiles a Markdown deck into one **standalone HTML file** (same contract as the [xframe-present](skills/xframe-present/SKILL.md) skill). Pass **`data`** when the deck uses consolidated JSON for provenance footers or `xframe-graph` blocks.

```yaml
jobs:
  present:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: exergy-connect/xFrame.ai/present@main
        with:
          input: examples/present/example-deck.md
          output: examples/present/example-deck.html
          data: ${{ github.workspace }}/examples/consolidate/output/consolidated_data.json
```

#### Inputs

| Input | Required | Description |
| --- | --- | --- |
| `input` | yes | Path to the Markdown deck file. |
| `output` | no | Output HTML path (default: input path with `.html` extension). |
| `title` | no | Deck title (overrides front matter). |
| `author` | no | Author metadata (overrides front matter). |
| `theme` | no | `light` or `dark` (overrides front matter). |
| `data` | no | URL or path to consolidated xFrame JSON (overrides front matter). Local paths resolve relative to the deck directory unless absolute. |
| `no-embed-images` | no | Set to `true` to keep original image URLs instead of inlining as base64. |

#### Outputs

The HTML file at **`output`** (or `<input>.html` when `output` is omitted).

## Requirements

- **xframe-consolidate** / **xframe-present**: Node.js ≥18. Bundled scripts are self-contained; no `npm install` required.

## License

See [LICENSE](https://exergy-connect.github.io/xFrame.ai/LICENSE).
