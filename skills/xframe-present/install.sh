#!/usr/bin/env bash
# Copy the published present action CLI and YANG models into this skill.
#
# Usage: install.sh <action-dir> [skill-dest]
#   action-dir  Directory with present.min.js and model/*.yang
#               (xFrame.ai: actions/present; this repo: action-dist)
#   skill-dest  Installed skill root (defaults to this script's directory)

set -euo pipefail

action_dir=${1:?usage: install.sh <action-dir> [skill-dest]}
skill_dest=${2:-$(cd "$(dirname "$0")" && pwd)}

cli="$action_dir/present.min.js"
model_src="$action_dir/model"

if [ ! -f "$cli" ]; then
  echo "present action bundle missing at $cli" >&2
  exit 1
fi
if [ ! -d "$model_src" ]; then
  echo "present YANG models missing at $model_src" >&2
  exit 1
fi

scripts="$skill_dest/scripts"
model_dest="$skill_dest/model"
mkdir -p "$scripts" "$model_dest"

cp "$cli" "$scripts/present.min.js"
if [ -f "$action_dir/package.json" ]; then
  cp "$action_dir/package.json" "$scripts/package.json"
fi

rm -f "$model_dest"/*.yang
cp "$model_src"/*.yang "$model_dest/"

echo "Installed: xframe-present CLI and YANG models"
