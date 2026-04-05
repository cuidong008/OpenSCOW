#!/bin/sh
# 在启动 scow-slurm-adapter 前先启动 sssd（纯 LDAP 场景）。
# 依赖：/etc/sssd/sssd.conf 已就绪（Secret 挂载或 initContainer 写入），权限 root 只读即可。
set -eu

# 官方 ghcr.io/pkuhpc/scow-slurm-adapter 镜像通常为 /app/scow-slurm-adapter-amd64；其它底图可设 ADAPTER_BIN。
ADAPTER_BIN="${ADAPTER_BIN:-/app/scow-slurm-adapter-amd64}"
SSSD_BIN="${SSSD_BIN:-/usr/sbin/sssd}"
WAIT_SEC="${SSSD_WAIT_SEC:-45}"
SMOKE_USER="${SSSD_SMOKE_USER:-}"

if [ ! -f /etc/sssd/sssd.conf ]; then
  echo "entrypoint-sssd: 缺少 /etc/sssd/sssd.conf（请用 Secret 挂载或 initContainer 生成）" >&2
  exit 1
fi

# sssd 对配置权限敏感；Secret subPath 常为 0444，若启动报错可改为 initContainer 复制到 emptyDir 并 chmod 600。
chmod 600 /etc/sssd/sssd.conf 2>/dev/null || true

# sssd 需要这些子目录存在；monitor 的 D-Bus 套接字在 pipes/private（缺目录会 bind socket 失败）。
mkdir -p /var/lib/sss/db /var/lib/sss/pipes/private /var/lib/sss/mc /var/lib/sss/pub /var/log/sssd
# K8s emptyDir 在同一 Pod 内跨容器重启会保留内容；崩溃循环时残留的损坏 TDB 会导致 confdb EIO。
rm -rf /var/lib/sss/db/* /var/lib/sss/mc/* 2>/dev/null || true
chmod 711 /var/lib/sss 2>/dev/null || true
chmod 700 /var/lib/sss/db /var/lib/sss/mc 2>/dev/null || true

if [ ! -x "$SSSD_BIN" ] && command -v sssd >/dev/null 2>&1; then
  SSSD_BIN="$(command -v sssd)"
fi

if [ ! -x "$SSSD_BIN" ]; then
  echo "entrypoint-sssd: 未找到 sssd 可执行文件（镜像需安装 sssd）" >&2
  exit 1
fi

# 容器/PID1 场景下无参数 sssd 常失败或留下半初始化 DB；默认用 sssd -i 后台跑。
# 若需在裸机式环境先试传统 fork，设 SSSD_DAEMON=1。
if [ "${SSSD_DAEMON:-0}" = "1" ]; then
  if ! "$SSSD_BIN"; then
    echo "entrypoint-sssd: sssd 守护进程模式失败，改用 sssd -i …" >&2
    "$SSSD_BIN" -i &
  fi
else
  "$SSSD_BIN" -i &
fi

i=0
while [ "$i" -lt "$WAIT_SEC" ]; do
  if [ -n "$SMOKE_USER" ]; then
    if getent passwd "$SMOKE_USER" >/dev/null 2>&1; then
      break
    fi
  else
    if [ -S /var/lib/sss/pipes/nss ] 2>/dev/null || [ -S /var/lib/sss/pipes/sudo ] 2>/dev/null; then
      break
    fi
  fi
  i=$((i + 1))
  sleep 1
done

# Slurm 24+：sinfo 等需本机 sackd；套接字在 RUNTIME_DIRECTORY（默认 /run/slurm/）。须显式 -f slurm.conf（见 man sackd）。
# sackd 以 SlurmUser 运行，目录需对 slurm 用户可写（Ubuntu 包 sackd 会建 slurm 用户）。
SACKD_BIN="${SACKD_BIN:-}"
if [ -z "$SACKD_BIN" ]; then
  if [ -x /usr/sbin/sackd ]; then
    SACKD_BIN=/usr/sbin/sackd
  elif command -v sackd >/dev/null 2>&1; then
    SACKD_BIN="$(command -v sackd)"
  fi
fi
if [ -n "$SACKD_BIN" ] && [ -f /etc/slurm/slurm.conf ]; then
  export SLURM_CONF="${SLURM_CONF:-/etc/slurm/slurm.conf}"
  export RUNTIME_DIRECTORY="${RUNTIME_DIRECTORY:-/run/slurm}"
  mkdir -p "$RUNTIME_DIRECTORY"
  chown slurm:slurm "$RUNTIME_DIRECTORY" 2>/dev/null || chmod 1777 "$RUNTIME_DIRECTORY" 2>/dev/null || true
  : > /tmp/sackd.log
  echo "entrypoint-sssd: 启动 sackd ($SACKD_BIN -f $SLURM_CONF) …" >&2
  # shellcheck disable=SC2086
  "$SACKD_BIN" -f "$SLURM_CONF" ${SACKD_EXTRA_ARGS:-} >>/tmp/sackd.log 2>&1 &
  SACKD_PID=$!
  sleep 2
  # sackd 常会 fork 后父进程退出，勿用 kill -0 $SACKD_PID 判断成败
  if ps aux 2>/dev/null | grep -q '[s]ackd'; then
    echo "entrypoint-sssd: sackd 运行中" >&2
  elif kill -0 "$SACKD_PID" 2>/dev/null; then
    echo "entrypoint-sssd: sackd 父进程 pid=$SACKD_PID" >&2
  else
    echo "entrypoint-sssd: 未检测到 sackd 进程，/tmp/sackd.log:" >&2
    head -120 /tmp/sackd.log >&2 || true
  fi
else
  if [ ! -f /etc/slurm/slurm.conf ]; then
    echo "entrypoint-sssd: 无 /etc/slurm/slurm.conf，跳过 sackd" >&2
  elif [ -z "$SACKD_BIN" ]; then
    echo "entrypoint-sssd: 未找到 sackd（请 docker build 安装 Ubuntu 包 sackd，并 ctr import 到节点；imagePullPolicy: Never 时仅 restart 不会更新镜像）" >&2
  fi
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

if [ ! -x "$ADAPTER_BIN" ]; then
  echo "entrypoint-sssd: 未找到适配器二进制: $ADAPTER_BIN（请设置 ADAPTER_BIN）" >&2
  exit 1
fi

exec "$ADAPTER_BIN"
