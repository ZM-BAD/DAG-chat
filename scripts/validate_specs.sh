#!/usr/bin/env bash
# validate_specs.sh — Spec file validation for DAG-chat
# Checks: naming convention, frontmatter, required sections, cross-references, key files existence

set -euo pipefail

SPEC_DIR="specs"
ERRORS=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

error() { echo -e "${RED}ERROR:${NC} $1"; ((ERRORS++)); }
warn()  { echo -e "${YELLOW}WARN:${NC} $1"; }
pass()  { echo -e "${GREEN}PASS:${NC} $1"; }

# --- [P0] File naming convention ---
echo "=== [P0] File Naming Convention ==="

USED_NUMBERS=()
for file in "$SPEC_DIR"/*.md; do
    [ -f "$file" ] || continue
    basename=$(basename "$file")

    # Skip README.md and 000-template.md
    if [[ "$basename" == "README.md" || "$basename" == "000-template.md" ]]; then
        pass "$basename — skipped (meta file)"
        continue
    fi

    # Check naming pattern: NNN-kebab-case.md
    if [[ ! "$basename" =~ ^[0-9]{3}-[a-z0-9-]+\.md$ ]]; then
        error "$basename — does not match NNN-kebab-case.md pattern"
        continue
    fi

    # Extract number
    num="${basename:0:3}"

    # Check for duplicates
    for used in "${USED_NUMBERS[@]+"${USED_NUMBERS[@]}"}"; do
        if [[ "$used" == "$num" ]]; then
            error "$basename — duplicate number $num"
        fi
    done
    USED_NUMBERS+=("$num")

    pass "$basename — valid naming"
done

# --- [P0] YAML Frontmatter ---
echo ""
echo "=== [P0] YAML Frontmatter Validation ==="

VALID_STATUSES="active draft deprecated"

for file in "$SPEC_DIR"/*.md; do
    [ -f "$file" ] || continue
    basename=$(basename "$file")

    # Skip meta files
    [[ "$basename" == "README.md" || "$basename" == "000-template.md" ]] && continue

    # Extract frontmatter (between --- markers)
    fm=$(awk '/^---$/{n++; next} n==1{print} n==2{exit}' "$file" 2>/dev/null)

    if [[ -z "$fm" ]]; then
        error "$basename — missing YAML frontmatter"
        continue
    fi

    # Check required fields
    for field in "name:" "spec-id:" "version:" "status:" "last-updated:"; do
        if ! echo "$fm" | grep -q "$field"; then
            error "$basename — missing required field '$field'"
        fi
    done

    # Check status value
    status=$(echo "$fm" | grep "^status:" | head -1 | sed 's/status: *//' | tr -d '"' | tr -d "'")
    if [[ -n "$status" ]]; then
        valid=false
        for s in $VALID_STATUSES; do
            [[ "$status" == "$s" ]] && valid=true
        done
        if [[ "$valid" == "false" ]]; then
            error "$basename — invalid status '$status' (must be one of: $VALID_STATUSES)"
        fi
    fi

    # Check spec-id matches filename number
    spec_id=$(echo "$fm" | grep "^spec-id:" | head -1 | sed 's/spec-id: *//' | tr -d '"' | tr -d "'")
    file_num="${basename:0:3}"
    if [[ -n "$spec_id" && "$spec_id" != "$file_num" ]]; then
        error "$basename — spec-id '$spec_id' does not match file number '$file_num'"
    fi

    pass "$basename — frontmatter valid"
done

# --- [P1] Required Sections ---
echo ""
echo "=== [P1] Required Sections ==="

REQUIRED_SECTIONS=("## Overview" "## Details" "## Key Files" "## Constraints" "## References")

for file in "$SPEC_DIR"/*.md; do
    [ -f "$file" ] || continue
    basename=$(basename "$file")
    [[ "$basename" == "README.md" || "$basename" == "000-template.md" ]] && continue

    for section in "${REQUIRED_SECTIONS[@]}"; do
        if ! grep -q "^${section}" "$file"; then
            error "$basename — missing required section '$section'"
        fi
    done

    pass "$basename — all sections present"
done

# --- [P1] Cross-reference validation ---
echo ""
echo "=== [P1] Cross-reference Validation ==="

for file in "$SPEC_DIR"/*.md; do
    [ -f "$file" ] || continue
    basename=$(basename "$file")
    [[ "$basename" == "README.md" || "$basename" == "000-template.md" ]] && continue

    # Check References section for [NNN-name](./NNN-name.md) links
    grep -A 20 "^## References" "$file" | grep -oE '\]\(\./[^)]+\)' | while read -r match; do
        # Extract path from ](./path.md)
        ref=$(echo "$match" | sed 's/](\.\///;s/)$//')
        ref_path="$SPEC_DIR/$ref"
        if [[ ! -f "$ref_path" ]]; then
            error "$basename — references non-existent spec '$ref'"
        fi
    done
done

# Check related-specs in frontmatter
for file in "$SPEC_DIR"/*.md; do
    [ -f "$file" ] || continue
    basename=$(basename "$file")
    [[ "$basename" == "README.md" || "$basename" == "000-template.md" ]] && continue

    fm=$(awk '/^---$/{n++; next} n==1{print} n==2{exit}' "$file" 2>/dev/null)

    # Extract related-specs entries
    in_related=false
    while IFS= read -r line; do
        if [[ "$line" =~ ^related-specs: ]]; then
            in_related=true
            continue
        fi
        if [[ "$in_related" == "true" ]]; then
            if [[ "$line" =~ ^[[:space:]]+-[[:space:]]+\"?([0-9]+-[a-z0-9-]+) ]]; then
                ref_name="${BASH_REMATCH[1]}"
                ref_file="$SPEC_DIR/${ref_name}.md"
                if [[ ! -f "$ref_file" ]]; then
                    warn "$basename — related-specs references '${ref_name}' but file not found (may not be created yet)"
                fi
            elif [[ ! "$line" =~ ^[[:space:]] ]]; then
                in_related=false
            fi
        fi
    done <<< "$fm"
done

pass "Cross-references checked"

# --- [P1] Key Files existence ---
echo ""
echo "=== [P1] Key Files Existence ==="

for file in "$SPEC_DIR"/*.md; do
    [ -f "$file" ] || continue
    basename=$(basename "$file")
    [[ "$basename" == "README.md" || "$basename" == "000-template.md" ]] && continue

    # Extract paths from Key Files section
    in_keyfiles=false
    while IFS= read -r line; do
        if [[ "$line" == "## Key Files" ]]; then
            in_keyfiles=true
            continue
        fi
        if [[ "$in_keyfiles" == "true" ]]; then
            if [[ "$line" == "##"/* ]]; then
                break
            fi
            # Extract backtick-enclosed paths using sed
            kf=$(echo "$line" | sed -n 's/.*`\(.*\)`.*/\1/p')
            if [[ -n "$kf" ]]; then
                # Only check paths with / or file extensions
                if [[ "$kf" == */* || "$kf" == *.* ]]; then
                    if [[ ! -f "$kf" ]]; then
                        warn "$basename — Key File '$kf' does not exist"
                    fi
                fi
            fi
        fi
    done < "$file"
done

pass "Key Files checked"

# --- Summary ---
echo ""
echo "================================"
if [[ $ERRORS -eq 0 ]]; then
    echo -e "${GREEN}All checks passed!${NC}"
    exit 0
else
    echo -e "${RED}$ERRORS error(s) found${NC}"
    exit 1
fi
