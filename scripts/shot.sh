#!/usr/bin/env bash
# Screenshot one clock in headless Chrome.
#   scripts/shot.sh <clock-id> <out.png> [at=ISO time] [W,H=1920,1080] [extra query]
# Needs a running server (default http://localhost:31337; override with BASE=...)
# and Node 22+. WAIT=ms of real time to let the clock run before capture.
set -euo pipefail
id=$1; out=$2; at=${3:-}; size=${4:-1920,1080}; extra=${5:-}
base=${BASE:-http://localhost:31337}
url="$base/?clock=$id&chrome=0"
[ -n "$at" ] && url="$url&at=$at"
[ -n "$extra" ] && url="$url&$extra"
exec node "$(dirname "$0")/shot.mjs" "$url" "$out" "${size%,*}" "${size#*,}" "${WAIT:-3000}"
