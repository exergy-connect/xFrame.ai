---
name: create-xp
description: Authors and edits xForm .xp / .xpt semantic documents—front matter concepts, shapes (_attributes), body segments, directives, includes, and templates. Use when creating or modifying .xp files, defining concepts or shapes, writing slide/lab content, or structuring a concept tree. For compiling outputs, use the xform skill.
disable-model-invocation: true
---

# Create `.xp` documents

Author **structured semantic documents** for xForm. Prefer meaning and concept
structure over presentation strings. Compile with the **xform** skill.

## File shape

Every `.xp` / `.xpt` is a stream of YAML-style documents delimited by whole-line
`---` (or `...`). Markers only—no Jinja sniffing.

1. **Front matter** (first document) — top-level keys are **concepts** (shapes,
   bindings, data). Exception: compiler-owned `_assert`.
2. **Body segments** (later documents) — free text and/or **directives**.
3. Optional **segment header**: YAML keys, then a line that is exactly `===`,
   then the segment body. Header keys are local to that segment. `_id` names
   the segment for `include(..., segments=...)`.

```yaml
---
greeting: Hello
note:
  _attributes:
    label: _string
    _content: _string
---
note:
  label: intro
  _content: {{ greeting }}
```

| Extension | Role |
|-----------|------|
| `.xp` | Document sources |
| `.xpt` | Templates (implicit `_templates` or `{% include %}`) |
| `.json` | Runtime concept bindings (compile-time merge) |
| `.js` | Jinja filter modules |

## Concepts and shapes

- **User concepts** describe domain meaning. Names must not start with `_`.
- **Framework concepts** use the reserved leading `_` (`_document`, `_templates`,
  `_attributes`, `_content`, `_assert`, …).
- **Shapes** declare allowed directive fields via `_attributes` (type name,
  enum list, `{ _type?, _required? }`, `{ _concept? }`, or
  `{ _dict: Shape }` for a named set of Shape instances). Optional `_format`:
  `content` | `xml` | `binary`.
- **Collections:** `[Shape]` = ordered list of Shape; `{ _dict: Shape }` =
  dict/set keyed by name whose values are Shape.
- **Directives** in the body: `conceptName:` + indented fields matching a shape.
  Deeper `_content:` holds nested body text.

`_required` is enforced only at finalization (`--final`), not at first parse.
Unresolved Jinja may remain until a target forces resolution.

## Concept hierarchy

Model hierarchy with **nested concepts and attributes**, not with `_` in names.

**Anti-pattern:** encode a path in a flat name (`network_interface_vlan`,
`slide_title_style`). Underscores do not create parent/child structure — they
only make a longer identifier. Hierarchy belongs in the concept tree (nested
bindings, attributes, and `_concept` relationships).

```yaml
# Prefer
network:
  interface:
    vlan: …

# Avoid
network_interface_vlan: …
```

Compound instance labels (`small_turtle`) are fine when they name one thing,
not a fake hierarchy.

## Composition patterns

- **Implicit templates:** `style._templates: file://./templates/style/` then
  `style: title` loads `templates/style/title.xpt`; root keys deep-merge over
  the template.
- **Includes:** `{% include "….xpt" %}` or
  `{{ include("other.xp", segments=["title"]) }}`.
- **Assertions:** `_assert: [{ test: "{{ … }}", message: "…" }]` in front matter
  or a segment header (not as bare body text).

## Minimal checklist

- [ ] Front matter closed with `---` / `...` before body segments
- [ ] Shapes use `_attributes`; instances do not invent unknown fields
- [ ] Hierarchy is nested concepts, not underscore-joined names
- [ ] User concept names do not start with `_`
- [ ] Compile with the **xform** skill when the user wants output
