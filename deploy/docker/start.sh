#!/usr/bin/env bash
# 在本目录启动 OpenSCOW（需已放置可执行的 ./cli，版本与 install.yaml 的 imageTag 一致）。
# 依赖：本机已 `docker compose`、已 `docker login` 到 Harbor（若镜像在私有库）。
# Slurm adapter：本机 Docker 见 ../scow-slurm-adapter/docker-compose.yml；若在 K8s 见 ../scow-slurm-adapter/k8s/（NodePort 30972）。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
if [[ ! -x ./cli ]]; then
  echo "缺少可执行文件 ./cli，请从 OpenSCOW Release 下载 cli-x64 并 chmod +x，见本目录 README。"
  exit 1
fi
./cli check-config
echo "先起 MIS/Audit 用 MySQL（db）…"
./cli compose up -d db
echo "等待数据库初始化（约 35s）…"
sleep 35
echo "启动全部服务…"
./cli compose up -d
echo "完成。浏览器访问 http://127.0.0.1:8001 （或本机局域网 IP:8001）；管理端常见路径 /mis/init/"
echo "若曾启用过 fluentd 遗留容器，可执行: ./cli compose down --remove-orphans 后再 up。"
