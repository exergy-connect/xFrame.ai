---
name: xframe-consolidate
description: Normalizes and consolidates YAML model and data files into validated JSON using the xFrame consolidator. Use when the user wants to consolidate YAML models and data, normalize entity data, validate against a schema, generate consolidated JSON/JS output, or run the consolidate script.
disable-model-invocation: true
---

# Consolidate (xFrame)

Normalize YAML model and data files into validated, consolidated JSON (and optional JS). Uses the xFrame consolidator: load model YAML, load data YAML, validate, compute fields, add change record, write output.

## When to use

- User wants to **consolidate** or **normalize** YAML model and/or data files.
- User mentions **xFrame**, **consolidator**, **consolidated_model**, **consolidated_data**.
- User has a **model/** and **data/** layout and wants JSON output.
- User wants to **validate** data against a model schema and get a single JSON artifact.

## How to run

From the repository root (or wherever the skill lives), run the minified script with Node (ESM, Node ≥18):

```bash
node skills/xframe-consolidate/scripts/consolidate.min.js <data_dir> --model-dir <model_dir> --note "<note>" [options]
```

**Required:**

| Argument | Description |
|----------|-------------|
| `<data_dir>` | Directory containing YAML data files (entity data). |
| `--model-dir <dir>` | Directory containing YAML model files (entity schemas). |
| `--note "<text>"` | Change note for this consolidation run (required, non-empty). |

**Optional:**

| Option | Description |
|--------|-------------|
| `--author <name>` | Author for the change record (default: current OS user). |
| `--git-commit-hash <hash>` | Git commit hash to attach to the change record. |
| `--js` | Also write `.js` ES module files (`consolidated_model.js`, `consolidated_data.js`). |
| `--jsz` | Also write gzipped JS artifacts (`.gz.js`). |

## Version

Installed: `.cursor/skills/.xframe-latest`
```bash
bash <(curl -fsSL https://exergy-connect.github.io/xFrame.ai/install-skills.sh) [--check|--update]
```

## Directory layout

- **Model directory**: YAML files defining entities, fields, and schema. Consolidator merges them into one schema.
- **Data directory**: YAML files with entity data keyed by entity name. Loaded, validated against the model, then normalized.
- **Output**: Written to **`<model_dir>/../output/`** (one level up from the model dir):
  - `consolidated_model.json` – merged entity schemas
  - `consolidated_data.json` – consolidated data with computed fields and change record
  - `consolidated_model.js` / `consolidated_data.js` – if `--js`
  - `consolidated_model.gz.js` / `consolidated_data.gz.js` – if `--jsz`

Paths can be absolute or relative. Create `output/` if missing.

## Example

```bash
node skills/xframe-consolidate/scripts/consolidate.min.js ./data --model-dir ./model --note "Sync from source" --author "ci" --git-commit-hash "$(git rev-parse HEAD)" --js
```

Output appears in `./output/` (sibling of `./model`).

## Errors

- Missing or non-directory `--model-dir` or `<data_dir>` → exit 1.
- Validation failures (e.g. schema or data) → logged; consolidator may exit 1.
- On success, logs paths to written files and exits 0.
