# xFrame.ai

Public repository of **Cursor agent skills** for [xFrame](https://github.com/exergy-connect/xFrame): model-driven data consolidation and related workflows.

## Skills

| Skill | Description |
| --- | --- |
| **xframe-model** | Model authoring and schema guidance for xFrame. |
| **xframe-consolidate** | Normalize and consolidate YAML model and data files into validated JSON (and optional JS). Run the consolidator from the command line or let the agent run it when you ask to consolidate or validate model/data. |

## Install (Cursor)

### Install script (recommended)

Run from your project root:

```bash
bash <(curl -fsSL https://exergy-connect.github.io/xFrame.ai/install-skills.sh)
```

Installs both skills into `.cursor/skills/` and records the suite version.

### Check for updates

```bash
bash <(curl -fsSL https://exergy-connect.github.io/xFrame.ai/install-skills.sh) --check
```

### Update

Re-run the install script. Existing skills are replaced with the latest version.

### Manual install

```bash
mkdir -p .cursor/skills
cp -r path/to/xFrame.ai/skills/xframe-model .cursor/skills/
cp -r path/to/xFrame.ai/skills/xframe-consolidate .cursor/skills/
```

## Requirements

- **xframe-consolidate**: Node.js ≥18 (for `consolidate.min.js`). No npm install; the script is self-contained.

## License

See [LICENSE](https://exergy-connect.github.io/xFrame.ai/LICENSE).