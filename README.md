# xFrame.ai

Public repository of **Cursor agent skills** for [xFrame](https://github.com/exergy-connect/xFrame): model-driven data consolidation and related workflows.

**Live demo:** [xFrame Present example deck](https://exergy-connect.github.io/xFrame.ai/examples/present/example-deck.html#1) — subsea tieback portfolio slides with consolidated-data graphs.

## Skills

| Skill | Description |
| --- | --- |
| **xframe-model** | Create or edit model and data files for xFrame consolidation (entity schemas, model YAML/JSON, data JSON). |
| **xframe-consolidate** | Normalize and consolidate JSON model and data into validated JSON Schema plus consolidated data (optional JS output, FK enum closure, data path filters). Run from the command line or let the agent consolidate when you ask to validate model/data. |
| **xframe-present** | Compile `.xp` authoring documents through normalized IR into HTML, PNG, and/or PowerPoint. Supports presentations (slidedeck, poster, readout, cover-letter), themes/styles, layouts, graphs, Jinja, and consolidated xFrame data. |
| **xform-author** | Author and edit xForm `.xp` / `.xpt` semantic documents (concepts, shapes, Jinja body segments, includes, templates, capability contracts). Compile with **xform-run**. |
| **xform-run** | Compile composable `.xp` documents into deterministic outputs (compile-tree JSON, finalized HTML/YAML/text, multi-file artifacts). Also scaffolds an xForm Dev Container. Requires Node.js ≥24. |
| **xframe-code** | Program-structure schema (packages, classes, methods, fields) using the xYang JSON Schema profile. Manual install only (see below). |

## Install (Cursor)

### Install script (recommended)

Run from your project root:

```bash
bash <(curl -fsSL https://exergy-connect.github.io/xFrame.ai/install-skills.sh)
```

Installs **xframe-model**, **xframe-consolidate**, **xframe-present**, **xform-author**, and **xform-run** into `.cursor/skills/` and records the suite version.

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
cp -r path/to/xFrame.ai/skills/xform-author .cursor/skills/
cp -r path/to/xFrame.ai/skills/xform-run .cursor/skills/
# optional:
cp -r path/to/xFrame.ai/skills/xframe-code .cursor/skills/
```

## Dev Container

This repository includes [`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json) for Cursor / VS Code **Dev Containers**. It uses the published **xForm** image (`ghcr.io/exergy-connect/experiments/xform:latest`) so you can compile `.xp` examples and run the lab UI without installing Node.js 24 locally.

- **Name:** `xFrame.ai`
- Reopen the folder in the container (Command Palette: **Dev Containers: Reopen in Container**).
- `--privileged` is required so the image can start in-container `dockerd` (Containerlab / lab deploy). Do not add the `docker-in-docker` feature; it conflicts with the image’s own daemon.
- After start, `xform` is on `PATH`. Lab UI: http://127.0.0.1:42042/
- `postStart` also runs the in-image skill installer into `.cursor/skills/` (same suite as the install script above).

## Examples

End-to-end sample under [`examples/`](examples/):

| Path | Description |
| --- | --- |
| [`examples/consolidate/`](examples/consolidate/) | Subsea tieback portfolio — JSON model, sample data, and consolidated output. See [README](examples/consolidate/README.md) for entity layout and how to run the consolidator. |
| [`examples/present/`](examples/present/) | Demo slide decks (`example-deck.md` / locale variants → HTML under `output/`) bound to the consolidated data, with shared graph specs via `@include`. |

CI on `main` keeps generated artifacts fresh via [`.github/workflows/examples-ci.yml`](.github/workflows/examples-ci.yml): consolidate, compile decks to `examples/present/output/`, copy into `docs/examples/present/`, and commit once.

## GitHub Pages

The live site ([exergy-connect.github.io/xFrame.ai](https://exergy-connect.github.io/xFrame.ai)) is published from [`docs/`](docs/) only. Pushes that touch other paths (skills sync, action metadata, README, and so on) do not trigger a Pages rebuild. CI copies the compiled demo deck into `docs/examples/present/` when it changes.

| Path under `docs/` | Served URL |
| --- | --- |
| `install-skills.sh` | `/install-skills.sh` |
| `latest` | `/latest` |
| `examples/present/example-deck.html` | `/examples/present/example-deck.html` |
| `examples/present/example-deck.cz.html` | `/examples/present/example-deck.cz.html` |
| `examples/resume/index.html` | `/examples/resume/` |
| `goa_field_of_dreams.html` | `/goa_field_of_dreams.html` |
| `LICENSE` | `/LICENSE` |

Root [`wrangler.jsonc`](wrangler.jsonc) deploys the `xframe-ai` Worker: static résumé assets under `docs/examples/resume` plus the Gemini proxy API (`/v1/*`, `/health`) from [`cloudflare-proxy/`](cloudflare-proxy/).

```bash
npm run deploy
npx wrangler secret put GEMINI_API_KEY
```

`npm run deploy` runs `cloudflare-proxy/scripts/check-config.js` first so deploy fails if `INVITE_MAX_KV_CONTEXT_CHARS` is not at least 25000 below `MAX_INPUT_CHARS`.

## Cloudflare Gemini proxy

[`cloudflare-proxy/`](cloudflare-proxy/) is the API module bundled into `xframe-ai` (keeps the Gemini key off the client for runtime LLM and Live TTS). See [cloudflare-proxy/README.md](cloudflare-proxy/README.md). CI deploys the combined Worker via [`.github/workflows/deploy-cloudflare-proxy.yml`](.github/workflows/deploy-cloudflare-proxy.yml) when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are configured.

## GitHub Actions

This repo publishes **composite** actions that wrap the bundled minified scripts under `skills/`. **Node.js ≥18** is required on the job runner (`ubuntu-latest` includes a suitable Node); **xForm** needs **Node.js ≥24**. Pin a branch, tag, or SHA (for example `@main`).

| Action | `uses` | Script |
| --- | --- | --- |
| [**xFrame consolidate**](actions/consolidate/action.yml) | `exergy-connect/xFrame.ai/actions/consolidate@main` | `skills/xframe-consolidate/scripts/consolidate.min.js` |
| [**xFrame present**](actions/present/action.yml) | `exergy-connect/xFrame.ai/actions/present@main` | `skills/xframe-present/scripts/present.min.js` |
| [**xForm**](actions/xform/action.yml) | `exergy-connect/xFrame.ai/actions/xform@main` | `skills/xform-run/scripts/xform.min.js` |

[`.github/workflows/examples-ci.yml`](.github/workflows/examples-ci.yml) uses the in-repo composite actions (`./actions/consolidate`, `./actions/present`) and is intended as a copyable template. External workflows pin the published refs below.

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
      - uses: exergy-connect/xFrame.ai/actions/consolidate@main
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

The published [present](actions/present/action.yml) action still compiles a Markdown deck into one **standalone HTML file**. The [xframe-present](skills/xframe-present/SKILL.md) skill compiles **`.xp`** sources to IR, HTML, PNG, and/or PowerPoint. Pass **`data`** when the deck uses consolidated JSON for provenance footers or graphs.

```yaml
jobs:
  present:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: exergy-connect/xFrame.ai/actions/present@main
        with:
          input: examples/present/example-deck.md
          output: examples/present/output/example-deck.html
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
- **xform-run** / **xForm** action: Node.js ≥24.

## License

See [LICENSE](https://exergy-connect.github.io/xFrame.ai/LICENSE).
