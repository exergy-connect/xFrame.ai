#!/bin/bash
# xFrame.ai skill suite installer

REPO="https://github.com/exergy-connect/xFrame.ai.git"
SKILLS=("skills/xframe-model" "skills/xframe-consolidate")
TARGET=".cursor/skills"
VERSION_URL="https://exergy-connect.github.io/xFrame.ai/version.json"

if [ ! -d ".cursor" ]; then
  echo "No .cursor directory found. Run this from your project root."
  exit 1
fi

# --check flag: compare versions only
if [ "$1" = "--check" ]; then
  LATEST=$(curl -fsSL "$VERSION_URL" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
  LOCAL=$(cat "$TARGET/.xframe-version" 2>/dev/null || echo "not installed")
  echo "Installed: $LOCAL — Latest: $LATEST"
  [ "$LOCAL" = "$LATEST" ] && echo "Up to date." || echo "Update available. Re-run without --check to install."
  exit 0
fi

TMP=$(mktemp -d)
git clone --filter=blob:none --sparse "$REPO" "$TMP"
cd "$TMP"
git sparse-checkout set "${SKILLS[@]}"

mkdir -p "$OLDPWD/$TARGET"
for SKILL in "${SKILLS[@]}"; do
  SKILL_NAME=$(basename "$SKILL")
  rm -rf "$OLDPWD/$TARGET/$SKILL_NAME"
  cp -r "$SKILL" "$OLDPWD/$TARGET/$SKILL_NAME"
  echo "Installed: $SKILL_NAME"
done

# Record installed version
curl -fsSL "$VERSION_URL" | grep -o '"version":"[^"]*"' | cut -d'"' -f4 > "$OLDPWD/$TARGET/.xframe-version"

rm -rf "$TMP"
echo "xFrame.ai suite v$(cat "$OLDPWD/$TARGET/.xframe-version") installed."
