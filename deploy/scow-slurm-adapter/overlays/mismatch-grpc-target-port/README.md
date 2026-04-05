# overlay：gRPC 实际端口与默认 8972 不一致（少数环境）

## 勿用 `grep 2304` 判断是否在监听 8972

在 **`/proc/net/tcp`** / **`tcp6`** 中，端口为 **4 位十六进制（大端）**：

| 十进制端口 | 十六进制（行内 `:xxxx`） |
|------------|---------------------------|
| **8972**   | **`230C`**                |
| 8964       | `2304`（与 8972 不同，勿混淆） |

因此 **`grep 2304` 不能**用来确认 8972；应 **`grep 230C`**，或使用：

```bash
kubectl -n slurm exec deploy/scow-slurm-adapter -c adapter -- sh -lc '(echo >/dev/tcp/127.0.0.1/8972) 2>/dev/null && echo ok || echo fail'
```

---

## 「随机端口」常见原因（小结）

1. **误判**：把 **`2304` 当成 8972** → 实际已在 **`230C`（8972）** 上监听，却以为没起来，再去改 `targetPort`，反而弄乱。  
2. **确为随机/高端口**：预编译适配器在个别环境下 **`net.Listen` 未按配置绑定 8972**（例如地址解析异常、旧构建缺陷等）；**与当前 OpenSCOW 仓库内源码逻辑不一致时**，优先 **用 PKUHPC 源码自编译** 二进制打底图（见主 **`README.md`**、`Dockerfile.adapter-local-bin`）。  
3. **每次重启 `targetPort` 要改**：仅当你确认 **LISTEN 的 hex 转十进制 ≠ 8972** 且会变化时才需要；若稳定为 **`230C`**，保持 **`targetPort: 8972`** 即可。

---

## 本 overlay 何时使用

仅当 **已排除 `230C`/8972**，且 **Endpoints 与 Pod 实际监听端口** 仍不一致时，编辑 **`service-targetport.json`** 中 **`value`** 为实际十进制端口，再：

```bash
kubectl apply -k deploy/scow-slurm-adapter/overlays/mismatch-grpc-target-port
```

仓库内默认 **`value": 8972`** 与 **`k8s/service.yaml` 一致**；仅在你需要改为其它端口时修改该文件。

**重要**：若某次 `rollout restart` 后实际端口变化，须重新查 **`grep " 0A "`** 并更新 **`value`**，否则可能出现 **`nc 节点:30972` = refused**。

本目录位于 **`deploy/scow-slurm-adapter/overlays/`**（不在 `k8s/` 下），避免 Kustomize 目录循环。

## 查当前十进制端口（确需 workaround 时）

```bash
kubectl -n slurm exec deploy/scow-slurm-adapter -c adapter -- sh -lc 'grep " 0A " /proc/net/tcp /proc/net/tcp6'
```

取行内最后一组 `:` 后的 4 位十六进制转十进制（例 `9B61` → `39777`）：

`python3 -c "print(int('9B61',16))"`

## 何时停用本 overlay

适配器已稳定监听 **8972**、**`kubectl apply -k deploy/scow-slurm-adapter/k8s`** 即可时：

```bash
kubectl apply -k deploy/scow-slurm-adapter/k8s
```

勿再 apply 本 overlay（或保持 **`service-targetport.json` 为 8972** 作为无操作补丁）。

OpenSCOW **`adapterUrl`** 仍为 **`节点IP:30972`**（NodePort 不变）。
