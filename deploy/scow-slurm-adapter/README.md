# scow-slurm-adapter + SSSD（Ubuntu / 本地镜像）

适配器在容器内 `su` 业务用户前，需能通过 **SSSD + LDAP** 解析用户（`getent passwd`）。

**当前清单默认：`ldap_tls_reqcert = never`**（不校验服务端证书，**不需要** `ldap_tls_cacert`、**不需要** LDAP CA Secret）。若日后改为 `demand` 并校验证书，见文末 **「可选：LDAPS + CA」**。

---

## 推荐执行顺序（`never`、仅 Secret 挂载 sssd.conf）

按你现状（`sssd.conf` 已在本地，例如仓库根目录 `sssd.conf`）建议按下面顺序做。

### A. 使用 Kubernetes 跑 adapter

1. **确认 `sssd.conf` 里 LDAP 地址 Pod 能访问**  
   例如 `ldap_uri = ldaps://172.16.84.71:636`：从**集群内**到该 IP:636 须路由/防火墙放行（与登录节点能通不是一回事）。

2. **本地构建镜像**（须在 **`deploy/scow-slurm-adapter`** 目录执行，或见下方「从仓库根目录构建」；`BASE_IMAGE` 换成你们线上适配器镜像，例如 `harbor.../scow-slurm-adapter:1.6.0`）  
   ```bash
   cd deploy/scow-slurm-adapter
   docker build -f Dockerfile.sssd \
     --build-arg BASE_IMAGE=harbor.aix.com:8443/library/scow-slurm-adapter:1.6.0 \
     -t scow-slurm-adapter-sssd:local .
   ```  
   若在 OpenSCOW 仓库根目录：  
   `docker build -f deploy/scow-slurm-adapter/Dockerfile.sssd --build-arg BASE_IMAGE=... -t scow-slurm-adapter-sssd:local deploy/scow-slurm-adapter`

3. **让将要运行 Pod 的节点上有该镜像**  
   - 若 Pod **固定**在某台机：在该机 build 即可，并在 `k8s/deployment.yaml` 里配置 **`nodeName` / `nodeSelector`**。  
   - 否则在该节点：  
     `docker save scow-slurm-adapter-sssd:local -o /tmp/a.tar` → `sudo ctr -n k8s.io images import /tmp/a.tar`  
     （多节点则每个可能调度 adapter 的节点都要导入。）

4. **用本地文件创建 Secret（仅 sssd.conf，不要提交 Git）**  
   下面路径按你实际文件调整（示例为仓库根目录的 `sssd.conf`）：  
   ```bash
   kubectl create secret generic scow-slurm-adapter-sssd \
     --namespace=slurm \
     --from-file=sssd.conf=/绝对或相对路径/sssd.conf \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

5. **创建适配器 ConfigMap（`config/config.yaml`，必须）**  
   官方镜像工作目录为 `/app`，进程在 `init` 阶段会读取 **`/app/config/config.yaml`**（MySQL/slurmdbd、监听地址等）。  
   - 复制 `k8s/configmap-adapter-config.example.yaml`，把 **`mysql`**（`host` 须从 Pod 内能 `ping`/`nc` 到）、**`password`**、**`clustername`** 等改成你的环境；  
   - `kubectl apply -f` 你的文件。  
   若未挂载该 ConfigMap，日志会出现 `open /app/config/config.yaml: no such file or directory`。  
   **`mysql.host` 勿用 `127.0.0.1`**（适配器在 Pod 内，`127.0.0.1` 是容器自己，没有 MySQL）：应填 **slurmdbd 所用数据库** 在集群内可解析的主机名或 IP（与 slurmctld 登录节点上 `config.yaml` 能通的地址一致即可，但路由要以 **从 slurm 命名空间 Pod 出发** 为准）。改 ConfigMap 后执行：  
   `kubectl -n slurm delete pod -l app=scow-slurm-adapter`（或 rollout restart）使挂载生效。

6. **应用 Deployment / Service**  
   ```bash
   kubectl apply -k deploy/scow-slurm-adapter/k8s
   kubectl -n slurm rollout restart deployment/scow-slurm-adapter
   kubectl -n slurm rollout status deployment/scow-slurm-adapter
   ```

7. **验证**  
   ```bash
   POD=$(kubectl -n slurm get pods -l app=scow-slurm-adapter -o jsonpath='{.items[0].metadata.name}')
   kubectl -n slurm exec -it "$POD" -- getent passwd 某LDAP用户名
   ```

8. **OpenSCOW**  
   `deploy/docker/config/clusters/slurm.yaml` 里 **`adapterUrl`** 指向可访问的 **节点IP:30972**（或你改的 NodePort）。若刚改过或仍连不上：  
   ```bash
   cd deploy/docker && ./cli compose restart mis-server portal-server
   ```

---

### B. 使用本机 Docker Compose 跑 adapter（不用 K8s）

1. `cd deploy/scow-slurm-adapter`  
2. `cp /你的路径/sssd.conf secrets/sssd.conf`  
3. `docker compose build && docker compose up -d`  
4. Slurm 挂载需要时：  
   `docker compose -f docker-compose.yml -f docker-compose.slurm.yml up -d`  
5. OpenSCOW 的 **`adapterUrl`** 指向本机 **8972**（同机常见 `172.17.0.1:8972`，以实际为准）。

---

## 文件说明

| 文件 | 说明 |
|------|------|
| `Dockerfile.sssd` | 在现有适配器镜像上安装 SSSD + `entrypoint-sssd.sh` |
| `k8s/deployment.yaml` | **`imagePullPolicy: Never`**；挂载 **`sssd.conf` Secret**、`/app/config` **ConfigMap** |
| `k8s/configmap-adapter-config.example.yaml` | 适配器 **`config.yaml`** 示例（先 `apply` 再 `kubectl apply -k`） |
| `k8s/service.yaml` | NodePort 30972 → 8972 |
| `docker-compose.yml` | 仅挂载 `./secrets/sssd.conf` |
| `patches/` | 上游适配器可选补丁（如 **`Gres=(null)`** 导致分区/API 失败），见 **`patches/README.md`** |

适配器二进制路径因底图而异：官方 `ghcr.io/pkuhpc/scow-slurm-adapter` 一般为 **`/app/scow-slurm-adapter-amd64`**；若为 **`/adapter/...`** 等，请改 `k8s/deployment.yaml` 中 **`ADAPTER_BIN`**（或与 `entrypoint-sssd.sh` 默认值一致）。

---

## 故障排查（精简）

- **`Gres=(null)` / 分区与集群信息为空 / `Exec command failed or slurmctld down`**：多为上游用 `awk` 解析 GPU 失败。可先给 Slurm 配好 GPU GRES；或在 **`PKUHPC/scow-slurm-adapter`** 源码上应用 **`patches/0001-gres-null-safe-gpu-count.patch`** 后自编译二进制，见 **`patches/README.md`**。  
- **`getent` 无用户**：Pod/容器到 **LDAPS 端口**是否通、`sssd.conf` 是否与登录节点一致、bind 密码是否正确。  
- **`ImagePullBackOff`**：使用 **`Never`** 时节点上必须有 **`scow-slurm-adapter-sssd:local`**。  
- **`config.ldb` / confdb EIO**：多为 **CrashLoop 后 emptyDir 里残留损坏 TDB**；entrypoint 会在启动前清空 `db/`、`mc/`。请 **重建带新 entrypoint 的镜像** 并 `rollout restart`。默认已用 **`sssd -i`**；若需对比传统 fork 可设 **`SSSD_DAEMON=1`**（见 `entrypoint-sssd.sh`）。  
- **`sbus-monitor` / `Failed to bind socket … pipes/private`**：不要把 emptyDir **挂在整个 `/var/lib/sss`**（会盖住镜像里 sssd 的 `pipes/`）。当前 **`deployment.yaml` 只挂 `/var/lib/sss/db` 与 `/var/lib/sss/mc`**；改完后 **`kubectl apply -k`** 即可，**不必**为这一条单独重打镜像。若仍报错，再 **重建 entrypoint** 镜像（其中会 `mkdir -p …/pipes/private`）。  
- **`open /app/config/config.yaml: no such file`**：按上文步骤创建 **`scow-slurm-adapter-config`**（`kubectl get configmap -n slurm scow-slurm-adapter-config`）。配置好后适配器还会在 **`init` 里 `Ping` MySQL**，`host` 须从 Pod 内可达。  
- **适配器不监听 8972 / gRPC UNAVAILABLE**：除 **`slurm.conf` + `munge.key` + `jwt.key` + `slurm.key`**（与 controller 一致，见 **`secret-slurm.example.sh`**）外，需 **`hostAliases`** 使 **`SlurmctldHost` 短名**可解析。Slurm **24+** 若 **`sinfo`** 报 **`failed to connect to any sack sockets`**：客户端依赖本机 **`sackd`**，`Dockerfile.sssd` 已装 Ubuntu 包 **`sackd`**（**不是** `slurm-sackd`），且 **`entrypoint-sssd.sh`** 会在起适配器前启动 **`sackd`**；**须重新 `docker build` 镜像并导入节点 / rollout**。`imagePullPolicy: Never` 时 **仅 `rollout restart` 不会换新镜像**，必须在运行 Pod 的节点上 **`ctr -n k8s.io images import`**（或等价方式）更新 **`scow-slurm-adapter-sssd:local`** 后再重启。若仍无 `sackd` 进程，看 **`kubectl logs`** 里 **`entrypoint-sssd:`** 与 **`/tmp/sackd.log`** 打头的几行（sackd 秒退时会把原因打到日志）。注意 **`scontrol show slurm`** 会连**本机 slurmd**，适配器 Pod 内无 slurmd 时出现 **Connection refused 属正常**，请用 **`sinfo`** / **`scontrol show config`** 等排查。
- **`/proc/net` 自查 8972（易错）**：Linux 里端口在 **`/proc/net/tcp`** / **`tcp6`** 中为 **16 位十六进制（大端）**。**`8972` = `0x230C`**，行末应出现 **`:230C`**。**不要**用 `grep 2304` 判断 8972：`0x2304` 对应的是 **8964**，与 8972 无关，会造成「以为没在监听」的**误判**。更稳妥：  
  `kubectl -n slurm exec deploy/scow-slurm-adapter -c adapter -- sh -lc '(echo >/dev/tcp/127.0.0.1/8972) 2>/dev/null && echo ok || echo fail'`  
  或 `grep 230C /proc/net/tcp /proc/net/tcp6`（同时看 **tcp** 与 **tcp6**）。  
- **ConfigMap 已是 `service.addr: 0.0.0.0:8972`，但 Service 仍 UNAVAILABLE**：先排除上文 **`2304`/`230C` 误判**。若确认 **LISTEN 行末十六进制转十进制后仍不是 8972**，少数底图/预编译二进制可能出现 **gRPC 落在其它端口**（或 **`Listen` 使用端口 0** 导致每次重启端口变化）。可先 **查实际监听端口**（`LISTEN` 状态为 **`0A`**，行内最后一组 `:` 后 4 位 hex → 十进制，例 `9B61` → `39777`）：  
  `kubectl -n slurm exec deploy/scow-slurm-adapter -c adapter -- sh -lc 'grep " 0A " /proc/net/tcp /proc/net/tcp6'`  
  再 **临时**把 Service 的 **`targetPort`** 改成该十进制端口（**`port` / `nodePort` 不用改**）：  
  `kubectl -n slurm patch svc scow-slurm-adapter --type=json -p='[{"op":"replace","path":"/spec/ports/0/targetPort","value":<十进制端口>}]'`  
  用 **`kubectl get endpoints -n slurm scow-slurm-adapter`** 核对。**根治**：换用与源码一致的**自编译**适配器或更新底图，使稳定 **`Listen` 8972**。仓库 **`k8s/service.yaml` 默认 `targetPort: 8972`**；若要在 Git 固化非 8972 的 workaround，用 **`deploy/scow-slurm-adapter/overlays/mismatch-grpc-target-port/`**（编辑 **`service-targetport.json`**），见该目录 **`README.md`**。

---

## 可选：LDAPS + 校验证书（`ldap_tls_reqcert = demand`）

若改为校验服务端证书，需要：

1. 在 `sssd.conf` 中设置 **`ldap_tls_cacert`**（例如 `/etc/sssd/ldap-ca/ca.crt`）与 **`ldap_tls_reqcert = demand`**（或与登录节点一致）。  
2. 在 **`k8s/deployment.yaml`** 中增加 **`ldap-ca` 的 volumeMount 与 secret 卷**（键名 **`ca.crt`**），并执行：  
   `kubectl create secret generic scow-slurm-adapter-ldap-ca -n slurm --from-file=ca.crt=./ldap-ca.crt`  
3. **`docker-compose.yml`** 中恢复挂载 **`./secrets/ldap-ca` → `/etc/sssd/ldap-ca`**。  

可参考 `k8s/secret-sssd.example.yaml`、`k8s/secret-ldap-ca.example.sh`（CA 场景）。
