# xFrame.ai

Public repository of **Cursor agent skills** for [xFrame](https://github.com/exergy-connect/xFrame): model-driven data consolidation and related workflows.

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

CI on `main` keeps generated artifacts fresh via [`.github/workflows/examples-ci.yml`](.github/workflows/examples-ci.yml): consolidate first, then compile the deck (`needs: consolidate`).

## GitHub Action

This repo publishes a **composite** action, [**xFrame consolidate**](action.yml), that runs the bundled minified consolidator (`skills/xframe-consolidate/scripts/consolidate.min.js`) on the runner. It expects **JSON** model fragments and entity data (same contract as the CLI in the [xframe-consolidate skill](skills/xframe-consolidate/SKILL.md)). **Node.js ≥18** is required on the job runner (`ubuntu-latest` includes a suitable Node).

Pin a branch, tag, or SHA (for example `@main` or a release tag you publish from this repo).

### Example workflow

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
          js: 'true' # optional: also emit consolidated.schema.js / consolidated_data.js
```

The repository checkout must contain **`<working-dir>/data`** and **`<working-dir>/model`**. Outputs are written to **`<working-dir>/output`**. This repo uses `examples/consolidate` as its working directory; your project can use any layout (for example `xframe/`).

### Inputs

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

### Outputs

See [xframe-consolidate](skills/xframe-consolidate/SKILL.md): **`consolidated.schema.json`**, **`consolidated_data.json`**, and logs under **`<working-dir>/output/`**.

## Requirements

- **xframe-consolidate** / **xframe-present**: Node.js ≥18. Bundled scripts are self-contained; no `npm install` required.
- **xframe-present**: compile with `node skills/xframe-present/scripts/present.min.js <deck.md>` (see [xframe-present](skills/xframe-present/SKILL.md)).

## License

See [LICENSE](https://exergy-connect.github.io/xFrame.ai/LICENSE).
