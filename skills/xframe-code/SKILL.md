---
name: xframe-code
description: >-
  Models program structure (packages, classes, methods, fields) using the xYang
  JSON Schema profile: program-structure.yang.json generated from
  xframe-program-structure.yang. Use when documenting architecture as data,
  validating instance JSON, or when the user mentions xframe-code, program
  structure schema, or xyang profile for code layout.
---

# xframe-code program structure (x-yang JSON Schema)

## Location

Skill directory: **`skills/xframe-code/`** in the xFrame repo. For Cursor, symlink or copy to `.cursor/skills/xframe-code` or `~/.cursor/skills/xframe-code`.

## Source of truth

| File | Role |
|------|------|
| [xframe-program-structure.yang](xframe-program-structure.yang) | **YANG module** — edit this, then regenerate JSON |
| [program-structure.yang.json](program-structure.yang.json) | **Emitted** JSON Schema (draft 2020-12 + `x-yang`) — `parse_json_schema` / `generate_json_schema` compatible |
| [examples/program-structure.example.json](examples/program-structure.example.json) | Sample **instance** under root **`program`** |

## Regenerate `program-structure.yang.json`

From repo root (xYang on `PYTHONPATH`):

```bash
PYTHONPATH=/path/to/xYang/src python3 -c "
from pathlib import Path
from xyang.parser.yang_parser import YangParser
from xyang.json import schema_to_yang_json
root = Path('skills/xframe-code')
schema_to_yang_json(
    YangParser(expand_uses=False).parse_file(root / 'xframe-program-structure.yang'),
    output_path=root / 'program-structure.yang.json',
)
"
```

## Instance shape

- Root JSON object: one property per **module-level** YANG data node (this module uses **`program`** as the root container; meta-model uses **`data-model`**). Under **`program`**: **`schema-version`**, **`definition`** (name, version, language, repository, **`packages`**, **`top-level`**), etc.
- **`types`** list items: shared keys (`name`, optional `qualified-name`, `doc`) plus a **hoisted YANG choice** — instance data uses exactly one sibling key among **`class`**, **`interface`**, **`enumeration`**, **`function`** (no separate `kind` object; the JSON Schema uses **`oneOf`** on the list item). Class carries **`methods`** and **`fields`** (name + optional **`doc`**); interface has **`methods`**; enumeration has **`members`** (name only); function has optional **`doc`**.
- Leaf names use **hyphens** as emitted from YANG (`schema-version`, `qualified-name`, …).

## Validate

**JSON Schema (structure only):**

```bash
python3 -c "import json, jsonschema; r='skills/xframe-code'; jsonschema.validate(json.load(open(r+'/examples/program-structure.example.json')), json.load(open(r+'/program-structure.yang.json')))"
```

**xYang round-trip (schema → AST):**

```bash
PYTHONPATH=/path/to/xYang/src python3 -c "import json; from pathlib import Path; from xyang.json import parse_json_schema; parse_json_schema(json.loads(Path('skills/xframe-code/program-structure.yang.json').read_text()))"
```

## When not to use

- Replacing language type systems or runtime validation.
- xTract meta-model / entity consolidation — use `meta-model.yang` and the consolidator instead.
