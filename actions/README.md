# GitHub Actions

Do not edit these directories by hand. They are published from other repositories (except **consolidate**, which is maintained here).

| Action | `uses` | Source |
| --- | --- | --- |
| **present** | `exergy-connect/xFrame.ai/actions/present@main` | [xFrame.present](https://github.com/exergy-connect/xFrame.present) package workflow copies `action-dist/` here (`action.yml`, `present.min.js`, `model/`). |
| **xform** | `exergy-connect/xFrame.ai/actions/xform@main` | [experiments](https://github.com/exergy-connect/experiments) package workflow copies `xform/action-dist/` here (`action.yml`, `xform.min.js`). |
| **consolidate** | `exergy-connect/xFrame.ai/actions/consolidate@main` | This repository. Composite wrapper around `skills/xframe-consolidate/scripts/consolidate.min.js`. |

`install-skills.sh` copies `actions/present/present.min.js` into `.cursor/skills/xframe-present/scripts/` and `actions/xform/xform.min.js` into `.cursor/skills/xform-run/scripts/` locally. Those files are not stored under `skills/`.
