#!/usr/bin/env bash
# Rebuilds the demo repo from scratch (default: ~/prov-demo) and wires it up for the live demo:
#   - .vscode/settings.json  sets provenance.cliPath so the VS Code extension finds `prov`
#   - .bob/mcp.json          registers the prov-mcp server for Bob
#
# Needs `prov` and `prov-mcp` on PATH (see README, Install). Usage: bash examples/reset-demo.sh [folder]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$HOME/prov-demo}"

PROV="$(command -v prov || true)"
PROV_MCP="$(command -v prov-mcp || true)"
if [ -z "$PROV" ] || [ -z "$PROV_MCP" ]; then
  echo "error: 'prov' and 'prov-mcp' must be on PATH (see README, Install)." >&2
  exit 1
fi

# Refuse to delete anything that is not a previous demo repo.
if [ -e "$TARGET" ] && [ ! -d "$TARGET/.provenance" ]; then
  echo "error: '$TARGET' exists and is not a Provenance demo repo; refusing to delete it." >&2
  exit 1
fi
rm -rf "$TARGET"

bash "$SCRIPT_DIR/demo-repo.sh" "$TARGET"

mkdir -p "$TARGET/.vscode" "$TARGET/.bob"
cat > "$TARGET/.vscode/settings.json" <<EOF
{
  "provenance.cliPath": "$PROV"
}
EOF
cat > "$TARGET/.bob/mcp.json" <<EOF
{
  "mcpServers": {
    "provenance": {
      "command": "$PROV_MCP",
      "args": ["--repo", "$TARGET"]
    }
  }
}
EOF
printf '.vscode/\n.bob/\nreport.html\n' >> "$TARGET/.git/info/exclude"

echo
echo "Ready: $TARGET"
echo "  VS Code: open the folder, trust it, open src/refund.ts"
echo "  Bob:     open the folder, then ask \"Why does the refund endpoint reject negative amounts?\""
