# scow-slurm-adapter 本地补丁

上游仓库：<https://github.com/PKUHPC/scow-slurm-adapter>

## `0001-gres-null-safe-gpu-count.patch`

**问题**：节点上 Slurm 报告 `Gres=(null)`（未配置 GRES / 自动探测不到 GPU）时，原先用 `grep ' Gres=' | awk …` 解析 GPU 数，`awk` 会异常退出，导致 `GetClusterConfig` / `GetAvailablePartitions` 失败，OpenSCOW 出现「集群无法连接」、分区列表为空等。

**做法**：用 Go 解析 `scontrol show node` 的 `Gres=` 行；`(null)` 与常见 `gpu:N` 格式返回数字字符串，不再依赖易失败的 `awk` 管道。

**应用补丁并编译 Linux amd64 二进制**（版本需与线上一致时，请先 `git checkout <tag>`）：

```bash
git clone https://github.com/PKUHPC/scow-slurm-adapter.git
cd scow-slurm-adapter
# 可选：git checkout v1.x.x

patch -p1 < /path/to/OpenSCOW/deploy/scow-slurm-adapter/patches/0001-gres-null-safe-gpu-count.patch

# 若 patch 报错，说明与当前 master 差异过大，需手动合并或向 PKUHPC 提 PR 后换新 patch

CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o scow-slurm-adapter-amd64 .
```

将生成的 **`scow-slurm-adapter-amd64`** 放到 **`deploy/scow-slurm-adapter/`** 目录（该文件名已在 `.gitignore`），再按仓库 **`Dockerfile.adapter-local-bin`** → **`Dockerfile.sssd`** 构建镜像并部署。

**长期**：建议把同等修改提交到 [PKUHPC/scow-slurm-adapter](https://github.com/PKUHPC/scow-slurm-adapter) 上游，便于跟随版本发布，无需本地打补丁。
