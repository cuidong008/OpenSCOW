# Slurm 插件目录（构建上下文）

与挂载的 `slurm.conf` 中 **`PluginDir`**（常见为 `/usr/lib/x86_64-linux-gnu/slurm`）内容一致。打 `Dockerfile.sssd` 镜像前，须先同步到本目录，否则构建会失败。

推荐（在 `deploy/scow-slurm-adapter` 下执行）：

```bash
./scripts/sync-slurm-plugins-from-cluster.sh
```

或手动：

```bash
mkdir -p files/slurm-plugins
rm -rf files/slurm-plugins/*
kubectl -n slurm cp slurm-controller-0:/usr/lib/x86_64-linux-gnu/slurm/. ./files/slurm-plugins/ -c slurmctld
```

若控制器上插件在 `/usr/local/lib/slurm`，把上述路径改成该目录即可。

Slurm 升级后请重新同步再构建适配器镜像。
