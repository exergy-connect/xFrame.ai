---
name: xframe-consolidate
description: Normalizes and consolidates JSON model and data into validated JSON Schema plus consolidated data (optional JS/JSZ, optional --close-fk-enums). Use when the user wants to consolidate models and data, normalize entity data, validate, generate consolidated.schema.json / consolidated_data.json, close foreign-key fields to enums from loaded data, or run the consolidate script.
disable-model-invocation: true
---

# Consolidate (xFrame)

Normalize JSON model fragments and JSON data into a **JSON Schema** describing the merged model, plus **consolidated data** with computed fields and a change record. Default flow: load model → emit `consolidated.schema.json` → load data → validate / outliers / computed fields → version tracking → write `consolidated_data.json`. With **`--close-fk-enums`**, the first schema write is deferred until after data load so foreign-key properties get `enum` values from distinct primary keys present in that data; the merged schema then includes `x-fkEnumFromData: true`.

## When to use

- User wants to **consolidate** or **normalize** JSON model and/or data.
- User mentions **xFrame**, **consolidator**, **consolidated.schema.json**, **consolidated_data**, or legacy names **consolidated_model** / **consolidated_data**.
- User has **model/** and **data/** (or equivalent paths) and wants schema + data JSON output.
- User wants **validation** and a single **JSON Schema** artifact for the merged entity definitions.
- User wants **FK enum closure**: tighten foreign-key fields in the emitted schema to the set of referenced primary keys actually loaded (pass **`--close-fk-enums`**).

## How to run

From the repo root, with Node (ESM, Node ≥18):

**xFrame layout (this repo):**

```bash
node skills/xframe-consolidate/scripts/consolidate.min.js <data_dir> --model-dir <model_dir> --note "<note>" [options]
```

**Cursor install layout** (skills under `.cursor/skills/`):

```bash
node .cursor/skills/xframe-consolidate/scripts/consolidate.min.js <data_dir> --model-dir <model_dir> --note "<note>" [options]
```

**Required:**

| Argument | Description |
|----------|-------------|
| `<data_dir>` | Directory of `.json` data files (top-level keys = entity names, values = arrays of records). Recursive; skips dot-dirs and subdirs named `model` or `output`. |
| `--model-dir <dir>` | Directory of `.json` model fragments **or** a single existing `consolidated.schema.json` path to load entity defs from `$defs`. |
| `--note "<text>"` | **Reason for this run** (required, non-empty). Stored in `change`; describe the real delta (e.g. new entities, field changes, data corrections). Avoid generic *"Consolidate"* / *"Sync"*. |

**Optional:**

| Option | Description |
|--------|-------------|
| `--author <name>` | Author on the change record (default: OS username). |
| `--git-commit-hash <hash>` | Commit hash on the change record. |
| `--js` | Also write ES modules next to the JSON: `consolidated.schema.js` (`export const consolidatedModel = …`) and `consolidated_data.js` (`export const consolidatedData = …`). |
| `--jsz` | Also write `consolidated.schema.gz.js` and `consolidated_data.gz.js` (gzip+base64 loaders). |
| `--log-level <level>` | `DEBUG` \| `INFO` \| `WARNING` \| `ERROR` (default `INFO`). |
| `--clean` | Ignore prior `output/*.json` for version tracking and do not infer `--js` / `--jsz` from existing files. |
| `--close-fk-enums` | After load + flatten, set JSON Schema `enum` on foreign-key fields from distinct primary-key values **present in the loaded data** for the referenced entity. Replaces any model `enum` on those properties. Defers writing `consolidated.schema.json` until then; output includes `x-fkEnumFromData: true`. Validation still runs explicit **FK existence** checks unless the entity uses `validation: warn` / `skip`. |

## Version

Installed marker: `.cursor/skills/.xframe-latest`

```bash
bash <(curl -fsSL https://exergy-connect.github.io/xFrame.ai/install-skills.sh) [--check|--update]
```

## Directory layout

- **Model directory**: One or more `.json` files; each file is a data-model document with `entities: [ … ]`. Merged into one **JSON Schema** (`$defs` per entity). Alternatively, `--model-dir` may point at one `consolidated.schema.json` file.
- **Data directory**: `.json` files; each top-level array key is a normalized entity name; elements are records (nested children are hoisted per parent/foreign-key rules).
- **Output** (`<model_dir>/../output/`):
  - `consolidated.schema.json` – JSON Schema for the merged model (`$schema` 2020-12, entity defs under `$defs`). With **`--close-fk-enums`**, includes root `x-fkEnumFromData: true` and `enum` on FK properties derived from loaded data.
  - `consolidated_data.json` – wrapper with `version`, `timestamp`, optional `model` metadata, `data` (nested entity tree), and `change`.
  - `consolidation_log.txt` – step log (when not in a browser-like environment).
  - With `--js`: `consolidated.schema.js`, `consolidated_data.js`.
  - With `--jsz`: `consolidated.schema.gz.js`, `consolidated_data.gz.js`.

Paths may be absolute or relative; `output/` is created if missing.

## Example

```bash
node skills/xframe-consolidate/scripts/consolidate.min.js ./data --model-dir ./model \
  --note "Add field_reserves composites; update lifecycle dates from source" \
  --author "ci" --git-commit-hash "$(git rev-parse HEAD)" --js
```

**Example with FK enum closure** (schema enums on FK fields match primary keys in the loaded dataset; re-run after data changes):

```bash
node skills/xframe-consolidate/scripts/consolidate.min.js ./data --model-dir ./model \
  --note "Reconsolidate with FK enums closed to PKs present in loaded data" \
  --author "ci" --git-commit-hash "$(git rev-parse HEAD)" --js --close-fk-enums
```

Artifacts appear under `./output/` (sibling of `./model`).

## Errors

- Missing or invalid `--model-dir` / `<data_dir>` → exit 1.
- Consolidation or I/O failure → logged; exit 1.
- Success → exit 0; paths logged as above.
