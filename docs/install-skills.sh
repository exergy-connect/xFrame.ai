#!/bin/bash
# xFrame.ai skill suite installer

REPO="https://github.com/exergy-connect/xFrame.ai.git"
SKILLS=(
  "skills/xframe-model"
  "skills/xframe-consolidate"
  "skills/xframe-present"
  "skills/xform-author"
  "skills/xform-run"
)
TARGET=".cursor/skills"
VERSION_URL="https://exergy-connect.github.io/xFrame.ai/latest"
ACTION_CLIS=(
  "actions/present|xframe-present|present.min.js"
  "actions/xform|xform-run|xform.min.js"
)

if [ ! -d ".cursor" ]; then
  echo "No .cursor directory found. Run this from your project root."
  exit 1
fi

# --check flag: compare versions only
if [ "$1" = "--check" ]; then
  LATEST=$(curl -fsSL "$VERSION_URL")
  LOCAL=$(cat "$TARGET/.xframe-latest" 2>/dev/null || echo "not installed")
  echo "Installed: $LOCAL — Latest: $LATEST"
  [ "$LOCAL" = "$LATEST" ] && echo "Up to date." || echo "Update available. Re-run without --check to install."
  exit 0
fi

TMP=$(mktemp -d)
git clone --filter=blob:none --sparse "$REPO" "$TMP"
cd "$TMP"

SPARSE=("${SKILLS[@]}")
for spec in "${ACTION_CLIS[@]}"; do
  SPARSE+=("${spec%%|*}")
done
git sparse-checkout set "${SPARSE[@]}"

mkdir -p "$OLDPWD/$TARGET"
for SKILL in "${SKILLS[@]}"; do
  SKILL_NAME=$(basename "$SKILL")
  rm -rf "$OLDPWD/$TARGET/$SKILL_NAME"
  cp -r "$SKILL" "$OLDPWD/$TARGET/$SKILL_NAME"
  echo "Installed: $SKILL_NAME"
done

for spec in "${ACTION_CLIS[@]}"; do
  IFS='|' read -r action_dir skill_name bundle <<< "$spec"
  src="$TMP/$action_dir/$bundle"
  if [ ! -f "$src" ]; then
    echo "Action bundle missing at $action_dir/$bundle" >&2
    exit 1
  fi
  scripts="$OLDPWD/$TARGET/$skill_name/scripts"
  mkdir -p "$scripts"
  cp "$src" "$scripts/$bundle"
  if [ -f "$TMP/$action_dir/package.json" ]; then
    cp "$TMP/$action_dir/package.json" "$scripts/package.json"
  fi
  echo "Installed: $skill_name CLI from $action_dir"
done

# Record installed version
SUITE_VERSION=$(curl -fsSL "$VERSION_URL")
echo "$SUITE_VERSION" > "$OLDPWD/$TARGET/.xframe-latest"

rm -rf "$TMP"
echo "xFrame.ai suite v$SUITE_VERSION installed."
