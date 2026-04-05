---
sidebar_position: 3
title: 外部系统同步集成方案
---

# 外部系统同步集成方案

本文档描述 **外部业务系统** 与 **OpenSCOW（MIS）** 在用户、资料与状态上的集成方案，供架构评审与实现落地使用。

**对账与纠偏** 的独立需求说明见：[对账服务需求说明](./reconciliation-service.md)。

**用户改密同步**（外部改密 → Auth，与 MIS 门户改密同源）：见 [改密同步方案](./password-sync.md)。

---

## 1. 目标与原则

- **外部系统**：用户及 **启用 / 停用 / 锁定** 的权威来源；向 SCOW 同步创建用户、资料与封锁状态。
- **SCOW**：租户与账户在 MIS 管理；用户通过 **`CreateUser`**（路径 B）写入 **MIS + 认证目录**；**门户登录** 不由 MIS 的 Block/Unblock 控制。
- **MIS 状态**：仅区分 **封 / 未封**。外部 **停用** 与 **锁定** 在 MIS **表现相同**（均为 Block），**区别仅在外部系统记录**。

---

## 2. 身份与数据约定

| 项 | 约定 |
|----|------|
| **用户标识** | `identity_id` / `userId` 与 Auth、Linux、Slurm 用户名一致。 |
| **多账户** | 同一外部用户可对应多个 SCOW 账户；**启用/停用/锁定** 作用在 **该用户全部已加入 SCOW 账户**。 |
| **停用用户 vs 封账户** | **不等价**；不按「封账户」代替「用户停用」；对 **每个账户下的该用户** 分别 **Block**。 |
| **未入任何账户** | 外部记状态；用户加入 SCOW 账户后 **补一次** Block/Unblock；详见 [对账服务需求说明](./reconciliation-service.md) 兜底。 |

---

## 3. 创建与资料同步（路径 B）

1. **创建**：外部调用 **`CreateUser`** → MIS 建用户 + Auth 建目录账号（及现有 SSH 等逻辑）。  
2. **姓名 / 邮箱**： **`ChangeName`** / **`ChangeEmail`**（与 `ChangeEmail` 策略对齐：先 MIS、有能力再写目录；无 `changeName` 能力时仅 MIS 等，见实现阶段约定）。  
3. **租户**：用户落在约定租户；**加入账户** 在 MIS 或经 **`AddUserToAccount`** 等完成。  
4. **aix 与 `tenantName`**：`CreateUser` / `cluster-state` 等请求中的 `tenantName` **不能为空**（须为 MIS 中已存在的租户名）。**aix 实现约定**：配置项 `openscow.tenantName` **未设置或为空字符串时，代码默认填 `"default"`**（与 MIS 默认租户 `DEFAULT_TENANT_NAME` 一致）；多租户或默认租户名已变更的环境，须在配置中 **显式填写** 实际租户名。

---

## 4. 外部三态 → MIS（仅封 / 未封）

| 外部状态 | MIS 操作（对每个已加入的「用户 × 账户」） |
|----------|---------------------------------------------|
| **启用** | **Unblock** |
| **停用** | **Block** |
| **锁定** | **Block**（与停用相同，MIS 不区分） |

**全账户**：一次状态变更应对 **该用户下全部已有关联账户** 执行同一类操作。

---

## 5. SCOW → Slurm

- 不新增 Slurm 状态模型；沿用 **封锁/解封** 适配器（如 `blockUserInAccount` / `unblockUserInAccount`），与 **`sacctmgr` 修改 association** 等现有行为一致。  
- **Block/Unblock 不限制门户登录**；仅影响 **集群侧**（如是否允许交作业）。

---

## 6. 实时同步与集成方式

### 6.1 推荐：集群内 HTTP(JSON) + SCOW 侧薄网关

为降低外部系统（如 **aix**）接入成本，约定：

| 层级 | 说明 |
|------|------|
| **外部系统** | 使用 **HTTP + JSON** 调用 SCOW 侧 **薄 HTTP 网关**（集群内 Service，如 `http://scow-user-sync.<ns>.svc.cluster.local/...`）。 |
| **薄网关** | 校验 Token（或 mTLS）后，将请求 **转为 MIS gRPC**（如 `CreateUser`），并把错误映射为 HTTP 状态码/JSON。 |
| **MIS** | 仍只暴露/使用既有 gRPC 能力；网关为 **可选部署组件**，与 mis-server 同命名空间或同 Helm 发布均可。 |

**优点**：外部系统 **无需引入 protobuf**、无需与 SCOW proto 版本强绑定；调试可用 `curl`；配置 **开关 + URL + 凭据** 即可。

#### 已实现组件：`@scow/user-sync`

仓库内 **apps/user-sync** 为薄 HTTP 网关实现；与现有 SCOW 镜像相同入口，设置 **`SCOW_LAUNCH_APP=user-sync`** 即可单独启动本服务（需配置环境变量，见下表）。

| 环境变量 | 说明 |
|----------|------|
| `HOST` / `PORT` | HTTP 监听，默认 `0.0.0.0:8080` |
| `MIS_SERVER_URL` | **必填**，mis-server gRPC 地址（如 `mis-server:5000`） |
| `MIS_SCOW_API_TOKEN` | 若 MIS 在配置中启用了 `scowApi` 鉴权，则需与门户侧调用 MIS 时使用的 Token 一致 |
| `USER_SYNC_API_TOKEN` | **必填**，外部系统在请求头使用 `Authorization: Bearer <token>` |
| `AUTH_INTERNAL_URL` | **改密接口必填**，Auth 内网 HTTP 根地址（如 `http://auth:5000`），与 mis-web 的 `AUTH_INTERNAL_URL` 一致；用于 `PATCH /v1/users/:userId/password` → Auth `PATCH /password` |

**REST 接口**（除 `GET /health` 外均需上述 Bearer；**请勿在日志中打印密码或 Token**）：

| 方法 | 路径 | 请求体（JSON） | 对应 MIS gRPC |
|------|------|----------------|----------------|
| `GET` | `/health` | — | 存活探测，无鉴权 |
| `POST` | `/v1/users` | `tenantName`, `identityId`, `name`, `email`, `password` | `CreateUser` |
| `PATCH` | `/v1/users/:userId/profile` | `name` 与/或 `email`（至少一项） | `ChangeName` / `ChangeEmail` |
| `PATCH` | `/v1/users/:userId/password` | `newPassword` | 转发至 Auth **`PATCH /password`**（与门户改密同源），成功 **204**；详见 [改密同步](./password-sync.md) |
| `POST` | `/v1/users/:userId/cluster-state` | `tenantName`, `externalState`：`enabled` \| `disabled` \| `locked` | `GetUserInfo` 后对全部已关联账户 `BlockUserInAccount` / `UnblockUserInAccount`（已封/已解封时跳过） |
| `DELETE` | `/v1/users/:userId?tenantName=…` | — | `DeleteUser`；成功 **204**（[删除语义见下](#user-delete--get-users-gateway)） |
| `GET` | `/v1/users?tenantName=…` | — | `GetUsers`；响应见 [查询用户 JSON 字段](#get-v1-users-response) |
| `GET` | `/v1/users/:userId` | — | `GetUserInfo`；响应体 `{ "user": { … } }`，`user` 与 [列表项](#get-v1-users-response) **同构**（含 `tenantName`、Owner/Admin 衍生字段）；见 [反查对账与分页枚举](#reverse-reconciliation-pagination) |
| `GET` | `/v1/platform/users` | Query：可选 `page`（默认 1）、`pageSize`（默认 **200**，最大 **500**）、`sortField`（`userId` \| `name` \| `createTime`，默认 `userId`）、`sortOrder`（`asc` \| `desc`，默认 `asc`） | `GetAllUsers`；跨租户分页；响应含 `totalCount`、`platformUsers[]`（`userId`、`name`、`email`、`tenantName`、`createTime`、`platformRoles`、`availableAccounts`）及回显 `page` / `pageSize` / `sortField` / `sortOrder`；见 [反查对账与分页枚举](#reverse-reconciliation-pagination) |
| `POST` | `/reconciliation/run` | 可选：`tenantName`, `mode`, `dryRun` | 当前返回 **501**，完整对账见 [对账服务需求说明](./reconciliation-service.md) |
| `GET` | `/reconciliation/jobs/:jobId` | — | 当前返回 **501**（占位） |

失败时响应体形如：`{ "error": { "code": "...", "grpcCode": number, "message": "...", "details": "..." } }`（由 gRPC 映射而来）。

### MIS 用户、租户与网关删除/查询约定 {#user-delete--get-users-gateway}

#### 一个用户能属于多个租户吗？

- **不能（就 MIS 中「一条用户记录」而言）**：`userId`（登录名）在 MIS 用户表上 **全局唯一**，每条 **`User` 只关联一个租户**（`tenant_name`）。
- 同一用户可在该租户下加入 **多个账户**（`UserAccount`）；账户也归属该租户。若业务上需要「同名用户跨租户」，当前模型下需 **不同 `userId`**，或不在 MIS 用同一登录名表示。

#### `DELETE /v1/users/:userId` 的产品语义（**方案 A**，已采纳）

- 网关转 **MIS `DeleteUser`**；**HTTP 成功时统一返回 `204`**（无响应体），与「用户已从 MIS 侧删除」对齐。
- **不**在网关上按 Auth 能力区分状态码：当 Auth **不支持** 目录删用户（如 **SSH** 认证）时，mis-server 仍会 **只删 MIS** 并打 **warn**，**系统/LDAP 账号可能仍在**。外部系统（如 aix）与运维以本文档与 MIS 日志为准；若必须保证目录同步删除，应使用 **LDAP 且启用 Auth `deleteUser`**。
- **Query**：必须携带 **`tenantName`**，与 `DeleteUser` 的 `tenant_name` 一致。

#### aix 查询用户：账户管理员、租户 {#get-v1-users-response}

- 网关 **`GET /v1/users?tenantName=…`** 对应 gRPC **`GetUsers`**。响应体为 `{ "tenantName": "<查询所用租户>", "users": [ ... ] }`。
- **每条 `users[]` 元素**包含：
  - **`tenantName`**：该用户在 MIS 中 **所属租户**（与用户记录一致）。
  - **`accountAffiliations[]`**：每项含 **`accountName`**、**`role`**（`USER` \| `ADMIN` \| `OWNER`），以及网关计算的 **`isAccountAdmin`**、**`isAccountOwner`**（便于 aix 直接判断，无需自解析枚举）。
  - **`isAccountAdminInAnyAccount`**：是否在 **任一** 账户下为 **ADMIN**（账户管理员）。
  - **`isAccountOwnerInAnyAccount`**：是否在 **任一** 账户下为 **OWNER**（拥有者；**MIS `DeleteUser` 会拒绝**删除该用户）。
  - **`hasAccountAdminOrOwnerRole`**：任一下为 **ADMIN 或 OWNER**。若 aix 策略是「有账户管理职责则不向 SCOW 发起删除」，建议 **`hasAccountAdminOrOwnerRole === true` 时跳过删除**（因 **ADMIN** 在 MIS 侧仍可能被删掉，仅靠 MIS 无法保护）。
  - **`tenantRoles`**：**租户级**角色（如 `TENANT_ADMIN`），与账户内 `ADMIN` / `OWNER` **不同**。
- 在当前模型下，用户所有账户均在 **同一租户**，**账户所属租户** 与用户级 **`tenantName` 相同**。

### 6.2 其它能力（可与网关同形态或直连 gRPC）

| 能力 | 方式 |
|------|------|
| 创建用户 | 经网关 **HTTP(JSON) → gRPC `CreateUser`**；或同步服务 **直连 gRPC** |
| 改姓名/邮箱 | `ChangeName` / `ChangeEmail`（网关或直连） |
| 全账户封/解封 | 查询用户全部 `UserAccount` 后 **`BlockUserInAccount` / `UnblockUserInAccount`** |
| 安全 | 集群内访问；**Bearer Token** 或 **mTLS**；生产建议 **HTTPS**（Ingress 或 mesh） |

### 6.3 外部系统配置示例（以 aix 为例）

在 `config.yaml`（或等价配置）中增加 **OpenSCOW 关联开关**，例如：

```yaml
openscow:
  enabled: false
  syncURL: "http://scow-user-sync.scow.svc.cluster.local:8080/v1/users"
  token: ""           # 建议使用 K8s Secret 注入
  tenantName: "default"   # 可省略或留空：aix 代码默认使用 "default"
  timeoutSeconds: 15
  retryMax: 3
  retryIntervalMs: 1000
```

- **`syncURL`**：与 **aix** 等外部系统配置项名称一致；值为 **创建用户** 的 HTTP 路径，即 `POST …/v1/users` 的完整 URL（与 user-sync 文档中的 REST 表一致）。**也可只写网关根**（如 `http://scow-user-sync:8080`），由实现自动补上 `/v1/users`；资料与 `cluster-state` 等路径在同一网关根下拼接。  
- **`enabled: false`**：不调用 SCOW，行为与未集成时一致。  
- **`enabled: true`**：在用户 **本地注册事务 Commit 成功之后** 再触发同步（见下节）。  
- **`tenantName`**：传给 user-sync 的 `tenantName`（创建用户、cluster-state 等）。**未配置或为空时，aix 侧默认使用字符串 `default`**；若 MIS 默认租户不是 `default` 或需同步到其它租户，必须在本配置中写明正确租户名。

### 6.4 注册后同步：异步、失败不反滚、对账补单 {#registration-sync-policy}

针对 **用户注册成功后再同步到 SCOW** 的场景，约定如下：

| 项 | 约定 |
|----|------|
| **调用时机** | **数据库事务提交成功之后** 再发起同步，**不在**未提交前调用。 |
| **调用方式** | **异步**（如 goroutine、队列、后台任务），**避免阻塞**用户注册响应。 |
| **重试** | 同步失败时 **带退避重试**（次数/间隔可配置），提高短时网络或 SCOW 不可用时的成功率。 |
| **仍失败** | **不**因 SCOW 失败而将本地注册判为失败；**仅记录日志**（**禁止**在日志中输出明文密码），并可打指标告警。 |
| **最终一致** | 由 **[对账服务](./reconciliation-service.md)** 以外部为权威 **补建/纠偏**（「补单」），将 SCOW 拉齐。 |

**实现注意**：

- **幂等**：`CreateUser` 可能返回「已存在」；重试与对账补单须按 **幂等** 处理（已存在则跳过或改为更新策略）。  
- **安全**：JSON 中若含密码，传输路径建议 **TLS**（集群内 mesh 或 HTTPS）。  
- **窗口期**：可能出现 **aix 已注册、SCOW 尚未有用户** 的短暂不一致，由对账与运营可接受性覆盖。

---

## 7. 对账与纠偏（定时 + 手动）

在实时同步之外，增加 **对账服务**：**以外部为权威**，将 SCOW 拉齐；支持 **定时** 与 **手动触发**；**全量** 适合小租户或低频；**限流、批处理、审计** 为必含要点。

**详细需求**（接口清单、定时配置项、审计字段）见：[对账服务需求说明](./reconciliation-service.md)。

### 7.1 反查对账：SCOW 有、外部无（分页枚举 + 按需详情）{#reverse-reconciliation-pagination}

以下约定供 **外部系统（如 aix）** 在「发现 MIS/SCOW 中存在、但外部权威中不存在」的用户时做批量核对与删除决策；**不依赖租户列表**（无需先调 `GetTenants` 再按租户扫用户）。

#### 鉴权

- 与现有 user-sync 一致：请求头 **`Authorization: Bearer <USER_SYNC_API_TOKEN>`**。

#### 接口分工（user-sync HTTP → MIS gRPC）

| 步骤 | HTTP（已实现） | MIS gRPC | 用途 |
|------|----------------|----------|------|
| 全量分页 | `GET /v1/platform/users?page=…&pageSize=…` | `GetAllUsers` | **跨租户**枚举用户；**仅用于基础字段比对** |
| 单用户详情 | `GET /v1/users/:userId` | `GetUserInfo` | 响应 `{ "user": … }`，`user` 与 [`GET /v1/users` 列表项](#get-v1-users-response) **同构**（含 `isAccountOwnerInAnyAccount` 等），**按需调用** |

- **分页参数**：**`pageSize` 固定采用 200**（首期约定）；**不依赖** `totalCount` 的精确性，以「是否还有下一页」等业务规则结束扫描即可。
- **排序**：建议 **`USER_ID` 升序**，便于稳定翻页。
- **扫库一致性**：扫描过程中 MIS 侧用户增删可导致 **偶发漏扫或重复**；**可接受**，不首期引入游标。

#### 基础字段对账（分页结果）

- 使用 `GetAllUsers` 映射后的 **`PlatformUserInfo` 等价字段**即可（如 `userId`、`name`、`email`、`tenantName`、`createTime`、`platformRoles`、`availableAccounts` 等）。
- **首期不对齐** `UserAccount.blockedInCluster`（集群封/未封）：不在本反查流程中对比 block 状态；若将来要对齐三态/封锁，需另行扩展返回字段或增加查询（`blockedInCluster` 存于 MIS **`UserAccount`** 表字段，见实现侧说明）。

#### 详情补拉粒度（方案 A）

- **仅对「待删除（或待自动纠偏）的候选用户」** 调用 **`GET /v1/users/:userId`**，用于读取 **`isAccountOwnerInAnyAccount`** 等，再决定是否调用删除、是否提示「需先在超算侧解除账户拥有者关系」等。
- **不对**所有「SCOW 多出来」的用户全量补拉详情（除非产品后续要求报表展示全员账户角色）。

#### 删除与 `tenantName`

- 调用 **`DELETE /v1/users/:userId?tenantName=…`** 时，**`tenantName` 以 `GET /v1/users/:userId` 响应中的 `tenantName` 为准**（与分页条中的 `tenantName` 正常应一致；若不一致，**以单用户详情为准**）。

#### 删除幂等与 HTTP 404

- 当 MIS 中 **已不存在**该用户时，gRPC **`NOT_FOUND`** 经网关映射为 **HTTP `404`**。
- **约定**：若删除（或幂等删除）得到 **`404`**，视为 **SCOW 侧已无该用户**，即 **删除目标已达成**（幂等成功），外部对账可记为已对齐。

#### 失败策略

- **分页接口**或 **`GET /v1/users/:userId`** 任一次调用 **失败**：本次 **对账任务整体失败**，**先返回**；日志中建议记录失败时的 `page`、`userId` 等便于重跑。
- **不**因单条删除失败而静默吞掉；删除失败按网关返回错误处理与审计（与现有错误 JSON 一致）。

#### 平台级等特殊账号

- **首期不**在网关上自动排除「平台管理员」等账号；**是否删除由运维/管理员人工决策**，不在本方案中强制白名单规则。

### 7.2 外部系统（如 aix）实现说明与「管理 API」

- **user-sync** 仅提供 HTTP（`GET /v1/platform/users`、`GET /v1/users/:userId`、`DELETE` 等）；**完整对账流水线**（定时、审计、补建/改资料/封禁批处理）由 **外部系统或服务** 编排。
- 使用 **aix** 集成时，实现状态、库函数名与反查伪流程见 **aix 工程**内 `docs/deploy/config/mis/external-system-sync.md` **§7.2** 与 `reconciliation-service.md` **§8**。
- **管理 API**：指 **对外暴露、供管理员/运维调用的 HTTP 接口**（例如手动触发一次对账、查询对账任务状态），与 **进程内定时任务**、**独立命令行** 等触发方式相对；集成方可任选其一；**aix 当前未实现**此类 HTTP，仅提供可复用的 **Go 调用封装**（详见 aix 文档 §7.2 / §8.3）。

---

## 8. 已知边界

- MIS **无法**区分「停用」与「锁定」。  
- **禁止登录门户** 须由 **Auth/LDAP/IdP** 单独策略，不在 Block/Unblock 范围内。  
- **未加入任何账户** 时无法对集群做有效 Block/Unblock，依赖 **外部记账 + 入组后补偿** 与 **对账** 纠偏。

---

## 9. 架构小结

```
外部系统（权威，如 aix）
    │  注册成功后：异步 HTTP(JSON) + 重试；失败仅日志，对账补单
    ▼
薄 HTTP 网关（SCOW 侧，JSON → gRPC）
    ▼
MIS gRPC ──► Auth / 集群适配器 ──► Slurm 等

    │  对账（定时 + 手动）── 详见 reconciliation-service.md
    ▼
```

其它同步服务（状态、资料）可与网关同路径，或在信任 gRPC 的场景下 **直连 mis-server**。
