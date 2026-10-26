#!/bin/sh
# Start the personal Bob Analytics dashboard (local only, 127.0.0.1).
cd "$(dirname "$0")" && exec python3 server.py "$@"
