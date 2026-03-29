# OpenSCOW 镜像构建与 Compose 部署备忘

本文档路径：`deploy/OpenSCOW/deploy.md`。实际操作目录以 **OpenSCOW 仓库根目录**（即含 `docker/Dockerfile.scow` 与 `deploy/docker/` 的那一层）为准。

## 1. 构建镜像

在 **OpenSCOW 仓库根目录**执行（示例 tag 可按需改，如 `1.6.4_v1`）：

### 方式 A：host 网络（代理在宿主机 `127.0.0.1:7890` 时最直接）

```bash
cd /path/to/OpenSCOW   # 含 docker/Dockerfile.scow

docker build --network=host \
  -f docker/Dockerfile.scow \
  -t harbor.aix.com:8443/library/openscow:1.6.4 \
  --build-arg GIT_HTTP_PROXY=http://127.0.0.1:7890 \
  --build-arg GIT_HTTPS_PROXY=http://127.0.0.1:7890 \
  --progress=plain \
  .
```

### 方式 B：桥接网络 + `host.docker.internal`（不共用 host 网络栈）

```bash
cd /path/to/OpenSCOW

docker build \
  --add-host=host.docker.internal:host-gateway \
  -f docker/Dockerfile.scow \
  -t harbor.aix.com:8443/library/openscow:1.6.4 \
  --build-arg GIT_HTTP_PROXY=http://host.docker.internal:7890 \
  --build-arg GIT_HTTPS_PROXY=http://host.docker.internal:7890 \
  --progress=plain \
  .
```

说明：`Dockerfile.scow` 里**不要**给整段构建加全局 `HTTP_PROXY`（易把 `apk` 访问 Alpine CDN 搞挂），git/buf 走 `GIT_*` 即可。

## 2. 推送到 Harbor（在构建机上）

```bash
docker login harbor.aix.com:8443
docker push harbor.aix.com:8443/library/openscow:1.6.4
```

## 3. 部署目录与 `install.yaml`

部署工作目录为 **`deploy/docker/`**（相对 OpenSCOW 仓库根目录）。该目录内需有与镜像版本匹配的 **`cli`**（`openscow-cli`），并放置 **`install.yaml`**、`config/` 等。

修改镜像时通常改 **`install.yaml`** 中的：

- `image`：仓库地址，如 `harbor.aix.com:8443/library/openscow`
- `imageTag`：标签，如 `1.6.4` 或 `1.6.4_v1`（与构建 / push 的 tag 一致）

```bash
cd deploy/docker
```

## 4. 首次启动

```bash
./cli check-config
./cli compose up -d
```

## 5. 更换 OpenSCOW 镜像后如何重启

下面流程**正确**：先校验配置，再停栈、再起栈，会按新的 `install.yaml` 生成 Compose 并拉起容器。

```bash
cd deploy/docker
./cli check-config
./cli compose down
./cli compose up -d
```

**补充说明：**

- 若镜像在远端 Harbor 且 **tag 已变**：`compose up -d` 前可在部署机上执行 `./cli compose pull`（若 CLI 支持）或手动 `docker pull harbor.aix.com:8443/library/openscow:<新tag>`，避免仍用本地旧层。
- 若 **tag 不变**（例如仍叫 `1.6.4` 但你在本机重新 `docker build` 覆盖）：仅 `down`/`up` 可能仍命中旧 image id，可二选一：改用**新 tag** 并在 `install.yaml` 里同步；或先在部署机 `docker rmi harbor.aix.com:8443/library/openscow:1.6.4` 再 `pull`/`up`。
- 与 Slurm 对接时若只改了 `config/clusters/slurm.yaml` 等（例如 `adapterUrl`），一般 **`./cli check-config` 后重启 `mis-server` 与 `portal-server` 即可**；全量换平台镜像仍建议用上面的 `down` + `up`。

## 6. 本仓库 slurm-operator 中的对应路径

若从 **slurm-operator** 仓库进入 OpenSCOW 子目录：

- 构建：`cd deploy/OpenSCOW` 后执行第 1 节命令。
- 部署示例：`deploy/OpenSCOW/deploy/docker/`（与本文档同树下的 `install.yaml`）。
