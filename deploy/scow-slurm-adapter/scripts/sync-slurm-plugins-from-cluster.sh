#!/usr/bin/env bash
# 将 slurmctld 容器内 PluginDir 同步到 files/slurm-plugins/，供 Dockerfile.sssd 构建使用。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${ROOT}/files/slurm-plugins"
NS="${NS:-slurm}"
POD="${POD:-slurm-controller-0}"
CTR="${CTR:-slurmctld}"
SRC="${SLURM_PLUGIN_SRC:-/usr/lib/x86_64-linux-gnu/slurm}"

mkdir -p "$DEST"
find "$DEST" -mindepth 1 \( -name '.gitignore' -o -name 'README.md' \) -prune -o -print0 | xargs -0 rm -rf

kubectl -n "$NS" cp "${POD}:${SRC}/." "$DEST/" -c "$CTR"
count="$(find "$DEST" -type f | wc -l)"
echo "sync-slurm-plugins: $DEST ($count files)"
