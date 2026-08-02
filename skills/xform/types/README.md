# xForm type package

Shipped builtin types. The engine bootstraps from [`_type.xpt`](_type.xpt), which
declares `_type._templates` and indexes available names (`_string: _type`, …).

## Kernel vs declarative

| Kind | Ids | Load path |
|------|-----|-----------|
| **Kernel** (static) | `_url`, `_list`, `_dict`, `_file_type`, `_xp_file`, `_javascript` | TypeScript facades under `src/concepts/typeKernel/`; `.js` here is the reference implementation |
| **Declarative** | `_string`, `_integer`, `_boolean`, … | Loaded on demand via `_type._templates` |

## `_templates` locator

```yaml
# Short form → { _location, _mappings: { ".xpt": _xp_file } }
_templates: file://./types/

# Expanded (`.xpt` + `.js` co-located)
_templates:
  _location: file://./
  _mappings:
    ".xpt": _xp_file
    ".js": _javascript
```

`_mappings` values must be `_file_type` instances (`_xp_file`, `_javascript`).

## Encode / decode naming

Default external representation is `_string`. Protocol functions:

- `from_<id>_string` / `to_<id>_string`
- Builtin ids that start with `_` keep a double underscore: `_string` → `from__string_string`

Override with `_decode` / `_encode` on the type definition.

## Aliases

Spellings declared in `_type.xpt` with `_alias` (not separate `_type` templates).
Unlike ordinary bindings, **`_id` is the alias target**, not the spelling key
(`_int._id` → `_integer`):

```yaml
_int:
  _alias: _integer   # ⇒ _id: _integer
_number:
  _alias: _integer
_bool:
  _alias: _boolean
```

| Alias | `_id` (canonical) |
|-------|-------------------|
| `_int` | `_integer` |
| `_number` | `_integer` |
| `_bool` | `_boolean` |

## Adding a type

1. Add `<name>.xpt` (+ optional `<name>.js`) beside this index. The definition is
   bound under the type name; `_id` is implied (do not author `_id:`):

```yaml
---
repo:
  _extends: _string
  _decode: from_repo_string
  _encode: to_repo_string
  _attributes:
    scheme: _string
    owner: _string
    repository: _string
---
```

2. Register `<name>: _type` in `_type.xpt`.
3. No engine changes required for non-kernel types.

User packages can ship their own `_type.xpt` and merge via `mergeTypePackage`
(see `examples/types-repo/`).
