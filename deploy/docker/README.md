# OpenSCOW 与本仓库 K8s Slurm 对接说明

## 已完成：Harbor 镜像

已将本地 `openscow:local` 打 tag 并推送：

- `harbor.aix.com:8443/library/openscow:1.6.4`

`install.yaml` 中已配置上述 `image` / `imageTag`。

## 依赖镜像（Docker Compose / 无法访问 Docker Hub 时）

`./cli compose up -d` 还会拉取 **MySQL、Redis、Fluentd、noVNC 客户端** 等。若出现 `registry-1.docker.io` / `auth.docker.io` **EOF、超时**，说明当前环境访问 Docker Hub 不通。

本仓库 `install.yaml` 已把这些依赖写成 **Harbor 路径**（`harbor.aix.com:8443/library/...`）。你需要在 **能访问外网的一台机** 上拉取官方镜像、打 tag、`docker push` 到 Harbor 的 `library` 项目（或按你实际项目名改 `install.yaml` 前缀）。

示例（版本与 OpenSCOW 默认一致）：

```bash
export REG=harbor.aix.com:8443/library

for img in "mysql:8" "redis:alpine" "fluentd:v1.14.0-1.0"; do
  docker pull "$img"
  docker tag "$img" "$REG/$img"
  docker push "$REG/$img"
done

docker pull ghcr.io/pkuhpc/novnc-client-docker:master
docker tag ghcr.io/pkuhpc/novnc-client-docker:master "$REG/novnc-client-docker:master"
docker push "$REG/novnc-client-docker:master"
```

若 **ghcr.io 也不通**，需从其他渠道取得 `novnc-client-docker` 再导入 Harbor，或暂时在 `install.yaml` 的 `portal.novncClientImage` 指向你已存在的镜像；不需要门户里 noVNC 功能时，可查阅你所用 OpenSCOW 版本文档是否允许关闭相关能力（不同版本差异较大）。

也可改为使用国内镜像加速的 **完整仓库路径**（非 Harbor），只要 `install.yaml` 里 `mysqlImage` / `redisImage` / `fluentd.image` / `novncClientImage` 与之一致即可。

### `unknown: repository library/mysql not found`

表示 Harbor 上 `**library` 项目里还没有 `mysql` 仓库**（或从未 push 过该镜像）。仅推送了 `openscow` 不会自动创建 `mysql` / `redis` 等。

**推荐**：在本仓库根目录执行（需一台能拉 Docker Hub / ghcr 的机器，并已配置 `HARBOR_`* 或 `docker login`）：

```bash
export HARBOR_USERNAME=你的账号
export HARBOR_PASSWORD=你的密码
bash push-openscow-compose-deps-to-harbor.sh
```

脚本会把 `mysql:8`、`redis:alpine`、`fluentd:v1.14.0-1.0`、`novnc-client-docker:master` 推到 `harbor.aix.com:8443/library/`，与当前 `install.yaml` 一致。

若你的镜像放在 **别的 Harbor 项目**（非 `library`），请同时修改 `install.yaml` 里所有 `harbor.aix.com:8443/library/...` 前缀为实际项目路径。

## 从集群查询登录服务（更新 `loginNodes` 时用）

```bash
kubectl get svc -n slurm slurm-login-slinky slurm-login-gpu -o wide
```

**说明：**

- **仅在 OpenSCOW 跑在集群内 Pod 时**，才适合用 `*.svc.cluster.local`（集群 DNS）。
- **adapter** 默认用 `**deploy/scow-slurm-adapter/docker-compose.yml`** 在宿主机映射 **8972**；OpenSCOW 在同机 Docker 时 `adapterUrl` 多为 `**172.17.0.1:8972`**。若仍用 K8s 部署 adapter，见 `deploy/scow-slurm-adapter/k8s/`（`kubectl apply -k`，NodePort 等见 `service.yaml`）与 `deploy/scow-slurm-adapter/README.md`。

## 部署拓扑与 `loginNodes` / `adapterUrl`

### `./cli compose up -d` 会把 OpenSCOW 起在容器里吗？

会。`openscow-cli` 生成 Docker Compose，网关、auth、portal 等都在 **当前机器的 Docker** 里跑。它们与 **本机 Docker 起的 adapter**（或 K8s 里的 adapter）、**K8s 里的 login** 之间是普通 TCP 连接，**没有**自动加入 Kubernetes Pod 网络，也**没有** CoreDNS，所以 **仅集群内 DNS/ClusterIP 有效** 的地址常会失败。

### A. OpenSCOW 跑在集群外（Docker Compose）——`config/clusters/slurm.yaml` 当前默认

- `**adapterUrl`**：**adapter 默认用** `deploy/scow-slurm-adapter/docker-compose.yml` 在宿主机映射 **8972**；与 OpenSCOW **同机**时一般为 `**172.17.0.1:8972`**（docker0 网关以 `ip -4 addr show docker0` 为准）。验证：`nc -zv 127.0.0.1 8972`（宿主机）及 `docker exec … nc -zv 172.17.0.1 8972`（portal 容器）。若 adapter 仍部署在 K8s 且用 NodePort，再使用 `**<节点IP>:30972**` 等形式。
- `**loginNodes.address**`：使用 `**节点IP:NodePort**`（例如 `172.16.84.71:30122`）。OpenSCOW 使用 `host:port` 形式连接 SSH（实现上为 `address.split(":")`，见 `libs/ssh/src/ssh.ts`），因此 **NodePort 与默认 22 等价配置**。

#### 若 portal 报「scheduler API version can not be confirmed」

多为 **连不上 adapter**（地址/端口或防火墙），不一定是 adapter 版本过旧。先确认宿主机 `**docker compose` 起的 8972** 可访问，再核对 `adapterUrl` 与 `**./cli compose restart portal-server`**。

#### 若 `/api/dashboard/getClusterInfo` 返回 500，且 portal-server 日志为 `Exec command failed or don't set partitions`

说明 **adapter 的 gRPC 已通**，但 **scow-slurm-adapter** 执行 `**scontrol show partition`** 失败（无 Slurm 客户端、无 `slurm.conf`、无 Munge 或与 slurmctld 不通）。请按 `**deploy/scow-slurm-adapter/README.md**` 使用 `**docker-compose.slurm.yml**` 挂载 `**slurm.conf` / `munge.key**` 并 `**docker compose build**` 带 `**slurm-client**` 的镜像，然后 `**./cli compose restart portal-server**`。

### B. OpenSCOW 跑在集群内的 Pod（与 `slurm` 同集群）

把 `slurm.yaml` 换成文件中 **「集群内」注释块** 的 `.svc.cluster.local` 形式即可；此时 Pod 内可解析集群 DNS，且一般能直达 ClusterIP Service。

## 获取 openscow-cli（下载或编译）

**版本须与镜像一致**（当前示例为 **1.6.4**，与 `install.yaml` 的 `imageTag` 对齐）。

### 方式一：下载（推荐）

- **Release**：[PKUHPC/OpenSCOW Releases](https://github.com/PKUHPC/OpenSCOW/releases) 中每个版本会附带 `cli-x64` / `cli-arm64`。
- 示例（x86_64、指定版本）：

```bash
wget -O cli https://github.com/PKUHPC/OpenSCOW/releases/download/v1.6.4/cli-x64
chmod +x cli
```

- 若 Release 页提供 `latest` 跳转且与你的镜像 tag 一致，也可使用官方文档中的 `.../releases/download/latest/cli-x64`。
- **CI 产物**：在 [Test, Build and Publish Projects](https://github.com/PKUHPC/OpenSCOW/actions/workflows/test-build-publish.yaml) 的成功运行 Artifact 里可找 `openscow-cli`。

### 方式二：在本仓库 OpenSCOW 源码里编译

依赖：**Node.js**、**pnpm**（monorepo 内用 `pkg` 打成独立可执行文件）。

```bash
cd deploy/OpenSCOW
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @scow/cli build
```

生成的二进制在 `**deploy/OpenSCOW/apps/cli/exe/**`（文件名以 `pkg` 输出为准，如 `scow-cli-linux-x64`），复制到部署目录后改名为 `cli` 并 `chmod +x`。

## 启动步骤（概要）

**快捷方式**：本目录已含 `cli` 时可直接执行 `**./start.sh`**（先起 `db`、等待后再全量 `up`，减轻 MIS/portal 竞态）。

1. 准备目录，放入与镜像版本匹配的 `openscow-cli`，命名为 `cli` 并 `chmod +x`。
2. 将本目录下的 `install.yaml` 与 `config/`、`fluent/` 拷到工作目录（或直接把本目录当作工作目录）。
  - `check-config` 需要 `**config/common.yaml**`、`clusterTexts.yaml`、`ui.yaml` 等；若你只有 `auth.yml` 与 `clusters/`，会报 `config common doesn't exist`。  
  - 也可在工作目录执行 `**./cli init**` 或 `**./cli init -f**` 生成完整示例，再覆盖其中的 `auth.yml`、`clusters/slurm.yaml` 与本仓库 `install.yaml`。
3. 编辑 `config/auth.yml`：已与仓库 Bitnami 示例及 `helm/slurm/values.yaml` 对齐（`cn=admin,dc=example,dc=org` / `ou=users` 等）；若你修改过 `LDAP_ADMIN_PASSWORD` 或 OU 结构，请同步改 `bindPassword` / `userBase` / `groupBase`。
4. 编辑 `install.yaml`：至少修改 `mis.dbPassword`。
5. 执行：

```bash
./cli check-config
./cli compose up -d
```

1. 浏览器访问 `http://<服务节点IP>:80`；管理端初始化路径见 OpenSCOW 官方文档（常见为 `/mis/init/`）。

拉取 Harbor 镜像前，在运行 Docker 的机器上执行 `docker login harbor.aix.com:8443`。

### `EACCES: mkdir '/var/log/fluentd'`

默认示例曾使用系统路径，**非 root** 运行 `./cli compose` 会失败。若启用 `log.fluentd`，请把 `logDir` 设为当前目录下可写路径（如 `./fluentd-log`）。

### `Name resolution failed for target dns:mis-server:5000`（portal-server 反复重启）

`portal-server` 启动时会连 **MIS**（`mis-server:5000`）。若 **MySQL（`db`）晚于 `mis-server` 就绪**，`mis-server` 可能立刻退出；在部分 Docker/Compose 版本下，**没有正常运行的 `mis-server` 任务时，服务名 `mis-server` 无法解析**，portal 就会报上述错误并崩溃。

**临时处理（无需改镜像）**：先只起数据库，等 MySQL 完成初始化后再起全栈：

```bash
./cli compose up -d db
# 约 30～60 秒后，或直到: docker logs openscow-db-1 2>&1 | tail -5 无持续报错
./cli compose up -d
```

**长期修复**：本仓库已在上游 `deploy/OpenSCOW/apps/cli/src/compose/index.ts` 为 `**mis-server` → `depends_on: db`**、`**portal-server` / `portal-web` → `depends_on: mis-server**`。需用**当前源码重新构建** `openscow` 镜像与 `openscow-cli` 后，再部署即可避免该竞态。

### MIS 创建账户报 `CLUSTEROPS_ERROR` / `14 UNAVAILABLE: No connection established`（连 adapter 失败）

**门户仪表盘正常**但 **MIS 里创建账户失败**时，常见原因是：**mis-server** 访问 `**config/clusters/slurm.yaml` 里的 `adapterUrl`** 不通（gRPC 8972 / NodePort 30972）。创建账户由 **mis-server → scow-slurm-adapter**，与 portal 并行，**改 `adapterUrl` 后必须同时重启**：

```bash
./cli compose restart mis-server portal-server
```

在 **mis-server 容器内**验证（容器名以 `docker ps` 为准，多为 `openscow-mis-server-1`）：

```bash
docker exec openscow-mis-server-1 sh -lc 'nc -zv 172.16.84.71 30972'
```

把 `**172.16.84.71**` 换成你的 `**adapterUrl` 主机**；`succeeded` / `open` 表示 TCP 可达。若镜像无 `nc`，可在容器内装临时工具或换用 `bash -c 'cat < /dev/null > /dev/tcp/HOST/30972'`（需 bash）。若此处失败，请改 `adapterUrl`（同机 K8s 时可对比 `**172.17.0.1:30972**` 与 **节点局域网 IP:30972`** 哪种在 **mis-server** 里能通），再 **`./cli check-config`** 并重启 **mis-server**、**portal-server**。

若 TCP 已通仍失败：看 `**docker logs openscow-mis-server-1`** 与 `**kubectl -n slurm logs deploy/scow-slurm-adapter**` 同一时间戳；并确认 Slurm 侧 `**sacctmgr**` 与账户/用户是否已按官方流程建好（与 `NOT_FOUND: xxx does not exists` 类错误不同）。

### `failed to initialize logging driver: dial tcp 127.0.0.1:24224: connection refused`

启用 `**log.fluentd**` 时，OpenSCOW 会给各服务配置 **Docker fluentd 日志驱动**，守护进程在**启动每个容器时**就要连本机 `24224`。`log`（fluentd）容器往往还没监听该端口，`compose up` 并行启动就会失败。

本仓库 `**install.yaml` 已默认关闭 fluentd**，只保留 `log.level` / `pretty`，日志走 Docker 默认 **json-file**。若你确实要集中收集日志，需自行调整启动顺序或等 `log` 健康后再起其它服务（上游 cli 目前仅 `depends_on: log`，不等待端口就绪）。

---

## 关于 SSH（第 5 点详细说明）

OpenSCOW 文档要求：部署机上能通过 **SSH 以 root 登录各登录节点**，并把密钥挂进容器（默认挂载部署用户的 `~/.ssh`）。**不是**「用户用 SSH 登录 OpenSCOW 网页」这么简单，而是 **OpenSCOW 后端要主动 SSH 到登录/计算节点** 去做集群侧操作。

### 用 SSH 可以吗？

可以。**门户里很多能力就是靠这条 SSH 链路实现的。** 你需要满足的是：

1. **网络**：OpenSCOW 所在环境能连到 `loginNodes` 里填的地址和端口（集群内 DNS 或 NodePort + 节点 IP）。
2. **认证**：OpenSCOW 使用的密钥能登录目标上的 **root**（文档默认如此）。
3. **OpenSSH 版本**：若节点 OpenSSH > 8.2，按 OpenSCOW 文档处理 `PubkeyAcceptedKeyTypes=+ssh-rsa` 等兼容性说明。

### 若 SSH 未配好或 root 登不上，会缺什么功能？

典型会受影响或不可用的包括（依版本与模块略有差异）：

- **门户里的 Web Shell / 文件管理 / 与节点文件交互** 等依赖「连上登录节点」的能力；
- **交互式桌面、VNC 相关**（你还需 TurboVNC + 桌面环境，之前讨论过）；
- 若 `**config/portal.yaml`** 里 `**loginDesktop.enabled: true**` 但未满足 SSH+TurboVNC，浏览器控制台会出现 `**/api/desktop/listDesktops` 500**；默认模板为 `**enabled: false`** 以避免误开。
- 部分 **作业前后处理、与节点侧脚本协作** 的功能。

**通常仍能用的**（在 adapter 与 LDAP 正常的前提下）：

- 通过 **adapter** 走的 **作业提交、队列/作业查询、与 Slurm Accounting 相关** 的调度侧能力（具体以当前 OpenSCOW 版本为准）。

### K8s 登录 Pod 的特别说明

登录节点是 Pod 时，要确保 **Service 的 22 端口** 确实转发到容器内 `sshd`，且 **root + 密钥** 已在镜像或启动脚本里配好；否则 OpenSCOW SSH 会失败。若你只用 NodePort 从外网 SSH，OpenSCOW 在集群内时应优先用 **ClusterIP Service 的 22**，避免和 NodePort 混用导致配置混乱。

---

## 文件清单


| 文件                           | 说明                                 |
| ---------------------------- | ---------------------------------- |
| `install.yaml`               | Harbor 镜像、`mis` 数据库密码等             |
| `config/clusters/slurm.yaml` | `adapterUrl`、`loginNodes`（集群内 DNS） |
| `config/auth.yml`            | LDAP 占位，需按你的 OpenLDAP 实际修改         |


