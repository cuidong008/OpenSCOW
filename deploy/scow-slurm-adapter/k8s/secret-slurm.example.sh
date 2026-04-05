#!/usr/bin/env sh
# 从本机文件生成 Slurm Secret（勿提交密钥到 Git）。
# jwt / slurm.key 与 controller 一致，例如：
#   kubectl -n slurm exec slurm-controller-0 -- cat /etc/slurm/jwt.key > jwt.key
#   kubectl -n slurm exec slurm-controller-0 -- cat /etc/slurm/slurm.key > slurm.key
# 用法（默认 ./slurm.conf ./munge.key ./jwt.key ./slurm.key）：
#   ./secret-slurm.example.sh
#   ./secret-slurm.example.sh /p/slurm.conf /p/munge.key /p/jwt.key /p/slurm.key
set -eu
NS="${NS:-slurm}"
SLURM_CONF="${1:-./slurm.conf}"
MUNGE_KEY="${2:-./munge.key}"
JWT_KEY="${3:-./jwt.key}"
SLURM_KEY="${4:-./slurm.key}"
for pair in "slurm.conf|$SLURM_CONF" "munge.key|$MUNGE_KEY" "jwt.key|$JWT_KEY" "slurm.key|$SLURM_KEY"; do
  key="${pair%%|*}"
  path="${pair##*|}"
  if [ ! -f "$path" ]; then
    echo "secret-slurm: 缺少文件 $key -> $path" >&2
    exit 1
  fi
done
kubectl create secret generic scow-slurm-adapter-slurm \
  --namespace="$NS" \
  --from-file=slurm.conf="$SLURM_CONF" \
  --from-file=munge.key="$MUNGE_KEY" \
  --from-file=jwt.key="$JWT_KEY" \
  --from-file=slurm.key="$SLURM_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -
