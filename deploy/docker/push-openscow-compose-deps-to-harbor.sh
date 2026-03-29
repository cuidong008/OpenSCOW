#!/usr/bin/env bash
set -euo pipefail

# 将 OpenSCOW docker compose 依赖镜像同步到 Harbor，供 deploy/openscow/install.yaml 使用。
# 解决：unknown: repository library/mysql not found（Harbor 上尚无对应仓库/镜像）
#
# 用法（在能访问 Docker Hub / ghcr 的机器上）：
#   export HARBOR_USERNAME=...
#   export HARBOR_PASSWORD=...
#   bash hack/push-openscow-compose-deps-to-harbor.sh
#
# 可选环境变量：
#   HARBOR_REGISTRY   默认 harbor.aix.com:8443
#   HARBOR_PROJECT    默认 library（须与 install.yaml 中路径一致）
#   PULL_RETRIES      默认 5
#   PUSH_RETRIES      默认 3

HARBOR_REGISTRY="${HARBOR_REGISTRY:-harbor.aix.com:8443}"
HARBOR_PROJECT="${HARBOR_PROJECT:-library}"
HARBOR_USERNAME="${HARBOR_USERNAME:-admin}"
HARBOR_PASSWORD="${HARBOR_PASSWORD:-}"
PULL_RETRIES="${PULL_RETRIES:-5}"
PUSH_RETRIES="${PUSH_RETRIES:-3}"

retry() {
  local max_attempts="$1"
  shift
  local attempt=1
  local delay=2
  until "$@"; do
    if [[ "${attempt}" -ge "${max_attempts}" ]]; then
      echo "Command failed after ${attempt} attempts: $*" >&2
      return 1
    fi
    echo "Attempt ${attempt}/${max_attempts} failed: $*" >&2
    echo "Retrying in ${delay}s ..." >&2
    sleep "${delay}"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
}

if [[ -z "${HARBOR_PASSWORD}" ]]; then
  echo "请设置 HARBOR_PASSWORD，或先执行: docker login ${HARBOR_REGISTRY}" >&2
  exit 1
fi

retry 3 docker login "${HARBOR_REGISTRY}" -u "${HARBOR_USERNAME}" -p "${HARBOR_PASSWORD}"

prefix="${HARBOR_REGISTRY}/${HARBOR_PROJECT}"

mirror_push() {
  local src="$1"
  local dst="$2"
  echo "=== ${src} -> ${dst} ==="
  retry "${PULL_RETRIES}" docker pull "${src}"
  docker tag "${src}" "${dst}"
  retry "${PUSH_RETRIES}" docker push "${dst}"
}

mirror_push "docker.io/library/mysql:8" "${prefix}/mysql:8"
mirror_push "docker.io/library/redis:alpine" "${prefix}/redis:alpine"
mirror_push "docker.io/library/fluentd:v1.14.0-1.0" "${prefix}/fluentd:v1.14.0-1.0"
mirror_push "ghcr.io/pkuhpc/novnc-client-docker:master" "${prefix}/novnc-client-docker:master"

echo "Done. deploy/openscow/install.yaml 中镜像前缀应为: ${prefix}/"
