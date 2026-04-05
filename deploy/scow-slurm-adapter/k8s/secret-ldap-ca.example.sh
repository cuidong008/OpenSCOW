#!/usr/bin/env sh
# 创建 LDAP CA Secret（勿提交 ca.crt 到 Git）。用法：
#   ./secret-ldap-ca.example.sh /path/to/ldap-ca.crt
set -eu
CRT="${1:?用法: $0 /path/to/ca.crt}"
kubectl create secret generic scow-slurm-adapter-ldap-ca \
  --namespace=slurm \
  --from-file=ca.crt="$CRT" \
  --dry-run=client -o yaml | kubectl apply -f -
