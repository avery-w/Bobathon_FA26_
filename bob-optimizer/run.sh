#!/bin/sh
# Bob Optimizer launcher: starts the Python data service and the Next.js web app, both on 127.0.0.1.
# One random access code is shared by both processes. It is shown once here and never written to disk or logs.
set -eu
cd "$(dirname "$0")"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
command -v node >/dev/null 2>&1 || { echo "Node.js 22 or newer is required." >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "Python 3 is required." >&2; exit 1; }

BOB_SERVICE_PORT="${BOB_SERVICE_PORT:-8766}"
BOB_WEB_PORT="${BOB_WEB_PORT:-3000}"
if [ -z "${BOB_ACCESS_CODE:-}" ]; then
  BOB_ACCESS_CODE="$(python3 -c 'import secrets; print(secrets.token_urlsafe(18))')"
fi
export BOB_SERVICE_PORT BOB_WEB_PORT BOB_ACCESS_CODE

if [ ! -d web/node_modules ]; then
  (cd web && npm ci --no-audit --no-fund)
fi
if [ ! -d web/.next ] || [ -n "$(find web/src web/package.json web/next.config.mjs -newer web/.next -type f 2>/dev/null | head -n 1)" ]; then
  (cd web && npm run build)
fi

python3 service/server.py --no-browser >/dev/null &
SERVICE_PID=$!
trap 'kill "$SERVICE_PID" 2>/dev/null || true' EXIT INT TERM

echo
echo "Bob Optimizer is running at http://127.0.0.1:${BOB_WEB_PORT}/"
echo "Access code (valid until you stop this script): ${BOB_ACCESS_CODE}"
echo "Press Ctrl+C to stop."
echo

cd web && npm run start
