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
PRESENT_ACTION="actions/present"

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
git sparse-checkout set "${SKILLS[@]}" "$PRESENT_ACTION"

mkdir -p "$OLDPWD/$TARGET"
for SKILL in "${SKILLS[@]}"; do
  SKILL_NAME=$(basename "$SKILL")
  rm -rf "$OLDPWD/$TARGET/$SKILL_NAME"
  cp -r "$SKILL" "$OLDPWD/$TARGET/$SKILL_NAME"
  echo "Installed: $SKILL_NAME"
done

BUNDLE="$TMP/$PRESENT_ACTION/present.min.js"
if [ ! -f "$BUNDLE" ]; then
  echo "Present action bundle missing at $PRESENT_ACTION/present.min.js" >&2
  exit 1
fi
SCRIPTS="$OLDPWD/$TARGET/xframe-present/scripts"
mkdir -p "$SCRIPTS"
cp "$BUNDLE" "$SCRIPTS/present.min.js"
if [ -f "$TMP/$PRESENT_ACTION/package.json" ]; then
  cp "$TMP/$PRESENT_ACTION/package.json" "$SCRIPTS/package.json"
fi
echo "Installed: xframe-present CLI from $PRESENT_ACTION"

# Record installed version
SUITE_VERSION=$(curl -fsSL "$VERSION_URL")
echo "$SUITE_VERSION" > "$OLDPWD/$TARGET/.xframe-latest"

rm -rf "$TMP"
echo "xFrame.ai suite v$SUITE_VERSION installed."
