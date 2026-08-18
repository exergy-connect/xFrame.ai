#!/usr/bin/env bash
# Smoke-test every skill with the Dev Container runtime (node/npm).
set -euo pipefail

repo="${1:-$(pwd)}"
cd "$repo"

pass() { printf 'OK  %s\n' "$*"; }
fail() { printf 'FAIL %s\n' "$*" >&2; exit 1; }

need_file() {
  local f="$1"
  [[ -f "$f" ]] || fail "missing $f"
}

echo "== runtime =="
command -v node >/dev/null || fail "node not on PATH"
command -v npm >/dev/null || fail "npm not on PATH"
node --version
npm --version

echo "== image installer =="
need_file /usr/local/bin/install-xFrame-ai-skills.sh
[[ -x /usr/local/bin/install-xFrame-ai-skills.sh ]] || fail "installer is not executable"
bash -n /usr/local/bin/install-xFrame-ai-skills.sh
pass "install-xFrame-ai-skills.sh"

# Mirror docs/install-skills.sh using this checkout instead of cloning GitHub.
install_root="$(mktemp -d)"
mkdir -p "$install_root/.cursor/skills"
for skill_dir in skills/*/; do
  name="$(basename "$skill_dir")"
  cp -a "$skill_dir" "$install_root/.cursor/skills/$name"
done
mkdir -p \
  "$install_root/.cursor/skills/xframe-consolidate/scripts" \
  "$install_root/.cursor/skills/xframe-present/scripts" \
  "$install_root/.cursor/skills/xform-run/scripts"
cp actions/consolidate/consolidate.min.js actions/consolidate/package.json \
  "$install_root/.cursor/skills/xframe-consolidate/scripts/"
cp actions/present/present.min.js actions/present/package.json \
  "$install_root/.cursor/skills/xframe-present/scripts/"
cp actions/xform/xform.min.js actions/xform/package.json \
  "$install_root/.cursor/skills/xform-run/scripts/"

skills_root="$install_root/.cursor/skills"
work="$(mktemp -d)"
declare -A TESTED=()
mark() { TESTED["$1"]=1; }

echo "::group::xform-author"
mark xform-author
need_file "$skills_root/xform-author/SKILL.md"
grep -q '^name: xform-author$' "$skills_root/xform-author/SKILL.md" \
  || fail "xform-author SKILL.md front matter"
mkdir -p "$work/xform-author"
cat > "$work/xform-author/hello.xp" <<'EOF'
---
greeting: Hello
---
===
{{ greeting }}
EOF
pass "xform-author"
echo "::endgroup::"

echo "::group::xform-run"
mark xform-run
need_file "$skills_root/xform-run/scripts/xform.min.js"
need_file "$skills_root/xform-run/scripts/package.json"
(
  cd "$work/xform-author"
  node "$skills_root/xform-run/scripts/xform.min.js" hello.xp
)
[[ -s "$work/xform-author/output/hello.json" ]] || fail "xform-run did not write compile tree"
[[ -s "$work/xform-author/output/hello.xp" ]] || fail "xform-run did not write segment output"
pass "xform-run"
echo "::endgroup::"

echo "::group::xframe-model"
mark xframe-model
need_file "$skills_root/xframe-model/SKILL.md"
grep -q '^name: xframe-model$' "$skills_root/xframe-model/SKILL.md" \
  || fail "xframe-model SKILL.md front matter"
need_file examples/consolidate/model/model.json
need_file examples/consolidate/data/sample_data.json
pass "xframe-model"
echo "::endgroup::"

echo "::group::xframe-consolidate"
mark xframe-consolidate
need_file "$skills_root/xframe-consolidate/scripts/consolidate.min.js"
need_file "$skills_root/xframe-consolidate/scripts/package.json"
cp -a examples/consolidate "$work/consolidate"
rm -rf "$work/consolidate/output"
node "$skills_root/xframe-consolidate/scripts/consolidate.min.js" \
  --working-dir "$work/consolidate" \
  --clean \
  --note "devcontainer image smoke" \
  --author ci
[[ -s "$work/consolidate/output/consolidated.schema.json" ]] || fail "consolidate missing schema"
[[ -s "$work/consolidate/output/consolidated_data.json" ]] || fail "consolidate missing data"
pass "xframe-consolidate"
echo "::endgroup::"

echo "::group::xframe-present"
mark xframe-present
need_file "$skills_root/xframe-present/SKILL.md"
need_file "$skills_root/xframe-present/scripts/present.min.js"
mkdir -p "$work/present"
cat > "$work/present/deck.xp" <<'EOF'
---
presentation: slidedeck
themes: [light]
title: Smoke
---
@id cover
@layout cover
# Title

---
@id agenda
# Agenda

- Item
EOF
node "$skills_root/xframe-present/scripts/present.min.js" \
  "$work/present/deck.xp" --ir --html --skip-audio -o "$work/present/out"
[[ -s "$work/present/out/deck.xp.json" ]] || fail "present missing IR"
[[ -s "$work/present/out/deck.slidedeck.html" ]] || fail "present missing HTML"
pass "xframe-present"
echo "::endgroup::"

echo "::group::xframe-code"
mark xframe-code
need_file "$skills_root/xframe-code/SKILL.md"
need_file "$skills_root/xframe-code/xframe-program-structure.yang"
need_file "$skills_root/xframe-code/program-structure.yang.json"
need_file "$skills_root/xframe-code/examples/program-structure.example.json"
node --input-type=module -e '
import { readFileSync } from "node:fs";
const schema = JSON.parse(readFileSync(process.argv[1], "utf8"));
const example = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
  throw new Error("unexpected schema \$schema");
}
if (!example.program?.definition?.name) {
  throw new Error("example missing program.definition.name");
}
' "$skills_root/xframe-code/program-structure.yang.json" \
  "$skills_root/xframe-code/examples/program-structure.example.json"
pass "xframe-code"
echo "::endgroup::"

missing=0
for skill_dir in skills/*/; do
  name="$(basename "$skill_dir")"
  if [[ -z "${TESTED[$name]:-}" ]]; then
    printf 'FAIL no smoke test for skill %s\n' "$name" >&2
    missing=1
  fi
done
[[ "$missing" -eq 0 ]] || exit 1

echo "All skills passed."
