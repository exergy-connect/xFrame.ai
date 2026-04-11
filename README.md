# xFrame.ai

Public repository of **Cursor agent skills** for [xFrame](https://github.com/exergy-connect/xFrame): model-driven data consolidation and related workflows.

## Skills

| Skill | Description |
| --- | --- |
| **xframe-model** | Model authoring and schema guidance for xFrame. |
| **xframe-consolidate** | Normalize and consolidate YAML model and data files into validated JSON (and optional JS). Run the consolidator from the command line or let the agent run it when you ask to consolidate or validate model/data. |

## Install (Cursor)

### Install script (recommended)

Run from your project root:

```bash
bash <(curl -fsSL https://exergy-connect.github.io/xFrame.ai/install-skills.sh)
```

Installs both skills into `.cursor/skills/` and records the suite version.

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
```

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
          working-dir: xframe
          note: 'Reconsolidate after model or data change'
          js: 'true' # optional: also emit consolidated.schema.js / consolidated_data.js
```

The repository checkout must contain **`<working-dir>/data`** and **`<working-dir>/model`** (default **`xframe`**). Outputs are written to **`<working-dir>/output`**.

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

- **xframe-consolidate**: Node.js ≥18 (for `consolidate.min.js`). No npm install; the script is self-contained.

## License

See [LICENSE](https://exergy-connect.github.io/xFrame.ai/LICENSE).