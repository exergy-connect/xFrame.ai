---
name: xframe-model
description: Create or edit model and data files for xFrame consolidation. Use when authoring entity schemas, model YAML/JSON, data JSON, or any input to the xframe-consolidate skill.
---

# xframe-model

Author **model** files (entity schemas) and **data** files (entity records) for [xFrame](https://github.com/exergy-connect/xFrame). After authoring, run the **xframe-consolidate** skill (or script) to validate and produce `consolidated_model.json` / `consolidated_data.json` under `output/`.

## When to use

- User wants to **define entities**, **model schema**, or **data** for xFrame.
- User is creating or editing files under `model/` or `data/` for consolidation.
- User mentions **xFrame model**, **entity**, **field_type**, **primary key**, **foreign key**, or **consolidate input**.

## Directory layout

- **model/** – One or more files defining entities and fields (merged into one schema). In this repo’s Python consolidator, **`*.yaml` / `*.yml`** are discovered; JSON with the same logical shape is valid for tooling, docs, and pipelines that accept it.
- **data/** – One or more **JSON** files with entity data, keyed by entity name. Often a single `sample_data.json` with multiple top-level entity keys.

## Version

Installed: `.cursor/skills/.xframe-latest`
```bash
bash <(curl -fsSL https://exergy-connect.github.io/xFrame.ai/install-skills.sh) [--check|--update]
```

## Meta-model rules (YANG)

These are **mandatory** for valid models:

| Level | Requirement |
|--------|----------------|
| **Data model** | `name`, `version`, `author`, **`description`** |
| **Entity** | `name`, **`description`**, `primary_key`, `fields` (and usually `brief`) |
| **Field** | `name`, **`description`**, and a type source (see **field_type** below) |

Optional: `source` at model, entity, or field level (where the data comes from).

## Field types: use `field_type` (canonical)

Each field must express its type via **`field_type`** (not a legacy top-level `"type"` on the field). 

### Primitives

`string`, `integer`, `number`, `boolean`, `date`, `datetime`, `duration_in_days`, and qualified variants as allowed by the meta-model.

```json
"field_type": { "primitive": "string" }
```

### Arrays

Use an empty `array` leaf (JSON: `null` value).

```json
"field_type": { "array": null },
"item_type": { "entity": "department" }
```

or `item_type`: `{ "primitive": "string" }`, etc.

### Composite primary keys / structured fields

```json
"field_type": { "composite": null },
"composite": [
  { "name": "part_a", "field_type": { "primitive": "string" }, "description": "…" }
]
```

(Subcomponents use **`field_type`** the same way; each needs a **`description`**.)

### Reusable definitions (`field_definitions` on an entity)

```json
"field_type": { "definition": "positive_number" }
```

Inline `min`/`max`/… must not duplicate the definition’s constraints when referencing a definition (enforced in consolidated validation).

### Outliers (sigma flagging)

Only on numeric or date/datetime primitives, as a sibling of `primitive` inside `field_type`:

```json
"field_type": {
  "primitive": "integer",
  "outlier": 1.0
}
```

Range `0.1`–`4.0` (see `meta-model.yang`). Omit `outlier` to disable.

## Model file shape (JSON)

Top-level:

```json
{
  "name": "My Model",
  "version": "25.01.01.1",
  "author": "Author Name",
  "description": "Required: what this model is for and main entities.",
  "source": "Optional model-level data source (e.g. URL, Excel file, API endpoint)",
  "entities": [
    {
      "name": "<entity_name>",
      "brief": "Short description",
      "description": "Required: AI-friendly entity description.",
      "source": "Optional entity-level data source",
      "primary_key": "<field_name>",
      "field_definitions": [],
      "fields": [
        {
          "name": "<field_name>",
          "description": "Required: field semantics and constraints.",
          "field_type": { "primitive": "string" },
          "required": true,
          "source": "Optional field-level data source",
          "foreignKeys": [
            {
              "entity": "<other_entity>",
              "parent_array": "Optional <array_field_on_parent> for nesting"
            }
          ],
          "item_type": { "entity": "<child_entity>" },
          "computed": {
            "operation": "add | subtraction | multiplication | division | min | max | average",
            "fields": [
              { "field": "<field_name>" },
              { "field": "<field_name>", "entity": "<entity_name>" }
            ]
          }
        }
      ]
    }
  ]
}
```

- **primary_key**: Name of the PK field (string). For composite PKs, the field is usually `field_type: { composite }` with a `composite` subcomponent list.
- **foreignKeys**: Link this field to another entity; **`parent_array`** is the parent’s array field used for nesting (required for parent/child hierarchies).
- **item_type**: Required for `field_type.array`; discriminated union: `entity`, `primitive`, or `foreignKey` list shape per meta-model.
- **computed**: Filled at consolidation; omit from data JSON.

## Data JSON structure

Use the **entity name** as the top-level key; value is a **list of records**. Nested children sit under the parent’s array field name (same shape as the model).

```json
{
  "company": [
    {
      "company_id": "acme",
      "company_name": "ACME Corp",
      "departments": [
        {
          "department_id": "eng",
          "department_name": "Engineering",
          "employees": [
            { "employee_id": "alice", "employee_name": "Alice" },
            { "employee_id": "bob", "employee_name": "Bob" }
          ]
        }
      ]
    }
  ]
}
```

- PK and FK values must match the model; referenced rows must exist where required.
- Omit computed fields in input data.

## After authoring

Run **xframe-consolidate** (skill or `skills/xframe-consolidate/scripts/consolidate.min.js`) with the same `model/` and `data/` paths.

## References

- Example model + data: `assets/example-model.jsonc`, `assets/example-data.jsonc` (Company → Department → Employee; JSONC with comments).
- Authoritative schema: `src/xframe/yang/meta-model.yang` in the xFrame repo.
- Consolidation: **xframe-consolidate** skill or project consolidator CLI.
