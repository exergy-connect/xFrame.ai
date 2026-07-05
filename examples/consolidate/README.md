# Example: Subsea Tieback Portfolio

A minimal xFrame example: oil & gas **subsea tieback** development projects and
their lifecycle **milestones**.

## Model (`model/model.json`)

- **project** — primary key `name`; an `operator`, a `budget` (millions USD),
  a `milestones` array and a `partners` array.
- **milestone** — composite primary key `milestone_key` = project `name`
  (foreign key to project) + `phase`
  (`discovery` | `appraisal` | `FID` | `first_oil` | `end_of_life`); nests under
  `project.milestones` (via `parents`) and carries a `date`.
- **partner** — composite primary key `partner_key` = project `name` (foreign
  key to project) + `partner_name`; nests under `project.partners` (via
  `parents`) and carries a `participation` percentage (stakes within a project
  sum to 100).

## Data (`data/sample_data.json`)

Three subsea tiebacks (`Julia`, `Penguins`, `Kaikias`), each with the five
lifecycle milestones and its joint-venture partners. The project `name` part of
each composite key is omitted on the nested milestone/partner rows because
hierarchical nesting already implies it.

## Run

From the [xFrame.ai](https://github.com/exergy-connect/xFrame.ai) repo root, with
Node.js ≥18:

```bash
node skills/xframe-consolidate/scripts/consolidate.min.js \
  --working-dir examples/consolidate \
  --clean \
  --note "Subsea tieback example"
```

Output is written to `output/` under this directory (`consolidated.schema.json`,
`consolidated_data.json`, `consolidation_log.txt`).

The bundled script is the same one used by the
[xframe-consolidate](https://github.com/exergy-connect/xFrame.ai/blob/main/skills/xframe-consolidate/SKILL.md)
skill and the repo's [GitHub Action](../../actions/consolidate/action.yml). In CI, point
`working-dir` at this folder:

```yaml
- uses: exergy-connect/xFrame.ai/actions/consolidate@main
  with:
    working-dir: examples/consolidate
    note: 'Subsea tieback example'
```

## Present

The consolidated data feeds the slide deck in
[`../present/`](../present/) (`example-deck.md` references
`../consolidate/output/consolidated_data.json`).
