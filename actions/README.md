# GitHub Actions

Product actions under `actions/` are published from other repositories. Do not edit those directories by hand.

Source repositories (including private ones) publish here with
[`../.github/actions/publish-to-xframe-ai`](../.github/actions/publish-to-xframe-ai/README.md):

```yaml
- uses: exergy-connect/xFrame.ai/.github/actions/publish-to-xframe-ai@main
  with:
    token: ${{ secrets.XFRAME_AI_TOKEN }}
    dirs_mapping: |
      action-dist|actions/my-tool
      skill|skills/my-tool
```

| Action | `uses` | Source |
| --- | --- | --- |
| **publish-to-xframe-ai** | `exergy-connect/xFrame.ai/.github/actions/publish-to-xframe-ai@main` | This repository. Reusable sync helper for public or private source repos. |
| **consolidate** | `exergy-connect/xFrame.ai/actions/consolidate@main` | [xFrame](https://github.com/exergy-connect/xFrame) package workflow copies `ts/consolidate/action-dist/` here (`action.yml`, `consolidate.min.js`). |
| **present** | `exergy-connect/xFrame.ai/actions/present@main` | [xFrame.present](https://github.com/exergy-connect/xFrame.present) package workflow copies `action-dist/` here (`action.yml`, `present.min.js`, `model/`). |
| **xform** | `exergy-connect/xFrame.ai/actions/xform@main` | [experiments](https://github.com/exergy-connect/experiments) package workflow copies `xform/action-dist/` here (`action.yml`, `xform.min.js`). |

`install-skills.sh` copies `actions/consolidate/consolidate.min.js` into `.cursor/skills/xframe-consolidate/scripts/`, `actions/present/present.min.js` into `.cursor/skills/xframe-present/scripts/`, and `actions/xform/xform.min.js` into `.cursor/skills/xform-run/scripts/` locally. Those files are not stored under `skills/`.
