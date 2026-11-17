#!/usr/bin/env bash
# Builds the native `hardstop` tool and runs the kernel + adversary tests on
# the native backend. Needs x86-64 Linux or AArch64 macOS (on Windows: WSL).
set -euo pipefail
cd "$(dirname "$0")/../fe"
FE="${FE:-fe}"
command -v "$FE" >/dev/null 2>&1 || FE="$HOME/.fe/bin/fe"
"$FE" --version
"$FE" test --backend native --color never "$@"
"$FE" build --backend native --color never
ls -l out/hardstop
