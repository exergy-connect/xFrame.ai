# xFrame.ai

Public repository of **Cursor agent skills** for [xFrame](https://github.com/exergy-connect/xFrame): model-driven data consolidation and related workflows.

## Skills

| Skill | Description |
|-------|-------------|
| **xframe-model** | Model authoring and schema guidance for xFrame. |
| **xframe-consolidate** | Normalize and consolidate YAML model and data files into validated JSON (and optional JS). Run the consolidator from the command line or let the agent run it when you ask to consolidate or validate model/data. |

## Install (Cursor)

### Install from GitHub (recommended)

Use Cursor’s built-in support for remote skills ([docs](https://cursor.com/docs/skills#installing-skills-from-github)):

1. Open **Cursor Settings → Rules**
2. In **Project Rules**, click **Add Rule**
3. Select **Remote Rule (Github)**
4. Enter this repo’s URL: `https://github.com/exergy-connect/xFrame.ai`

Skills are loaded from the repo; ensure each skill folder (e.g. `skills/xframe-consolidate/`) contains `SKILL.md` and any `scripts/` the skill needs.

### Install manually (copy into a skill directory)

Cursor loads skills from [skill directories](https://cursor.com/docs/skills#skill-directories) such as `.cursor/skills/` (project) or `~/.cursor/skills/` (user).

1. Clone or copy this repo (or the `skills/` subtree) into one of those locations.
2. Each skill must be in its own folder with a `SKILL.md` (e.g. `.cursor/skills/xframe-consolidate/SKILL.md`).
3. For **xframe-consolidate**, copy the whole `xframe-consolidate/` folder (including `scripts/consolidate.min.js`).

```bash
# Example: project skills
mkdir -p .cursor/skills
cp -r path/to/xFrame.ai/skills/xframe-consolidate .cursor/skills/
```

## Requirements

- **xframe-consolidate**: Node.js ≥18 (for `consolidate.min.js`). No npm install; the script is self-contained.

## Links

- **xFrame** (core): [github.com/exergy-connect/xFrame](https://github.com/exergy-connect/xFrame) — consolidator, loader, schema, and TypeScript port.

## License

Same as xFrame (MIT).
