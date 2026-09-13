#!/usr/bin/env bash
# Runs once when the container is created (see postCreateCommand).
set -euo pipefail

# Named volumes mount root-owned, and Docker creates any missing parent
# directories as root too. The opencode volume is nested under ~/.local/share,
# so that whole chain needs handing back to `node` -- otherwise opencode cannot
# create ~/.local/state on first run, its binary self-check fails, and the npm
# postinstall silently falls back to the wrong (musl) platform package.
sudo chown node:node \
  /home/node/.claude \
  /home/node/.local \
  /home/node/.local/share \
  /home/node/.local/share/opencode \
  /home/node/.config \
  /home/node/.config/gh

# GitHub access. The origin remote is SSH, but host SSH keys are not reliably
# available in here (agent forwarding depends on the client), so rewrite
# github.com SSH URLs to HTTPS and let gh supply the token. This is container-
# global git config only; the repo's .git/config and the host are untouched.
# Authenticate once with `gh auth login` (token persists in the gh-config
# volume) or via GH_TOKEN from the host.
git config --global credential.https://github.com.helper ''
git config --global --add credential.https://github.com.helper '!gh auth git-credential'
git config --global url."https://github.com/".insteadOf "git@github.com:"
git config --global --add url."https://github.com/".insteadOf "ssh://git@github.com/"

# npm's global prefix here (/usr/local/share/npm-global) is node-owned and
# already on PATH, so this needs no sudo. Pinned so a rebuild does not silently
# pick up a new major -- bump deliberately.
npm install -g opencode-ai@1.18.30

# beads issue tracker. Keep the pin in step with the host's `bd version`: both
# sides open the same .beads/embeddeddolt database through the bind mount.
npm install -g @beads/bd@1.2.2

# Hearth provider config lives in the repo so it is reviewable, but it is only
# valid inside the container (host.docker.internal does not resolve on the Mac
# host), which is why it is copied in rather than left at the project root.
mkdir -p /home/node/.config/opencode
cp "$(dirname "$0")/opencode.json" /home/node/.config/opencode/opencode.json
