---
sidebar_position: 4
title: 对账服务需求说明
---

# 对账服务需求说明

本文档描述 **外部系统与 OpenSCOW（MIS）同步** 场景下的 **对账与纠偏服务** 需求，作为同步服务实现与评审依据。整体集成背景见 [外部系统同步集成方案](./external-system-sync.md)。

---

## 1. 目标与定位

- **不替代**实时/事件同步；用于 **兜底**、**修正漂移**、**升级或故障后一次性对齐**。
- **权威策略**：**以外部系统为权威**；对账发现差异时，将 **SCOW（及由 MIS 驱动的集群侧状态）纠向外部**。
- **触发方式**：**定时调度** + **手动触发**（运维、排障、发布后校验）。
- **与注册同步衔接**：外部系统（如 aix）在 **注册成功后异步同步** SCOW；若同步与重试仍失败，**不反滚本地用户**，依赖本对账服务 **补建用户** 等操作将 SCOW 拉齐（详见 [外部系统同步集成方案 — 注册后同步策略](./external-system-sync.md#registration-sync-policy)）。

---

## 2. 对账范围

单次对账任务应在同一跑批内统一覆盖（实现上可同一流水线顺序执行）：

| 核对项 | 说明 | 纠偏动作（期望） |
|--------|------|------------------|
| 用户是否存在 | 外部应有用户是否在 MIS 中存在 | 缺失则 `CreateUser` 等补建；策略与主同步一致 |
| 姓名、邮箱 | 与外部权威值是否一致 | `ChangeName`、`ChangeEmail` |
| 封/未封（全账户） | 外部三态映射后的封/未封，与 MIS 各 `UserAccount` 是否一致 | 对每个已关联账户 `BlockUserInAccount` / `UnblockUserInAccount` |

**全量 vs 增量**：全量逻辑简单、压力大，适合小租户或低频；大规模场景可后续增加按时间窗或用户列表的 **增量对账**（本需求不强制首期实现）。

**限流与批处理**：多用户、多账户时须 **分批**、批次间 **退避**，避免对 MIS、Auth、Slurm 造成冲击。

---

## 3. 接口清单

以下接口为 **对账服务对外暴露能力** 的需求约定；具体路径、认证方式可与网关/BFF 统一设计。

### 3.1 手动触发对账

| 项目 | 说明 |
|------|------|
| **用途** | 运维或自动化在任意时刻触发 **一次** 对账跑批（全量或按参数限定范围）。 |
| **建议方法** | `POST` |
| **建议路径** | `/reconciliation/run`（或 `/api/v1/reconciliation/jobs` 创建任务） |
| **认证与鉴权** | 服务账号、mTLS 或机构统一网关鉴权；**禁止**匿名调用。 |
| **请求体（示例）** | `tenantName`（可选，限定租户）、`mode`：`full` \| `incremental`（可选）、`dryRun`：`boolean`（仅输出差异不纠偏，可选）。 |
| **响应（示例）** | `jobId`（异步时）、或同步返回 `summary`（处理用户数、修正条数、错误列表摘要）。 |
| **错误** | 权限不足、租户不存在、已有任务在跑（可选互斥）等返回明确 HTTP 状态码与错误码。 |

若采用 **异步任务**：应提供 **查询任务状态** 的接口（如 `GET /reconciliation/jobs/{jobId}`），返回 `pending` / `running` / `success` / `failed` 及摘要。

---

## 4. 定时配置项

对账服务应支持通过 **配置文件或环境变量** 启用/禁用定时调度，建议项如下：

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `reconciliation.enabled` | 是否启用定时对账 | `true` / `false` |
| `reconciliation.schedule` | Cron 表达式或等间隔 | `0 2 * * *`（每日凌晨 2 点） |
| `reconciliation.mode` | 默认定时模式 | `full` |
| `reconciliation.tenantScope` | 限定的租户列表；空表示全部 | `["tenant-a"]` |
| `reconciliation.batchSize` | 每批处理的用户数或账户数 | `50` |
| `reconciliation.batchIntervalMs` | 批次间隔（退避） | `1000` |
| `reconciliation.maxConcurrency` | 最大并发（可选） | `2` |
| `reconciliation.timeout` | 单次任务总超时 | `2h` |

定时任务与 **手动触发** 应 **共享** 同一套对账与纠偏逻辑，避免两套实现。

---

## 5. 审计字段

每次对账跑批（及建议的**子批次**）应记录以下信息，便于追责与排障；可落 **集中日志、审计库或操作日志系统**。

| 字段 | 说明 |
|------|------|
| `reconciliationBatchId` | 对账批次唯一 ID |
| `triggerType` | `scheduled` \| `manual` |
| `triggeredBy` | 触发主体（服务账号、运维用户 ID 等） |
| `tenantScope` | 涉及的租户 |
| `startedAt` / `finishedAt` | 起止时间 |
| `mode` | `full` / `incremental` |
| `dryRun` | 是否仅比对未纠偏 |
| `usersScanned` | 扫描用户数 |
| `correctionsTotal` | 修正总条数（可分字段） |
| `correctionsByType` | 可选：建用户、改名、改邮、封/解封各类次数 |
| `perUserChanges` | 可选明细：用户 ID、账户（若有）、**自何状态/值** 至 **何状态/值** |
| `errorsCount` / `errorsSample` | 失败条数与抽样错误信息 |
| `status` | `success` / `partial` / `failed` |

**明细级**（建议）：每条实际纠偏记录 `userId`、`tenantName`、`accountName`（若适用）、`action`（如 `BLOCK`、`UNBLOCK`、`UPDATE_NAME`）、`before` / `after` 摘要。

---

## 6. 与其它说明的关系

- 业务规则（多账户、全账户 Block/Unblock、未入组补偿、外部三态映射等）见 [外部系统同步集成方案](./external-system-sync.md)。
- 对账 **与实时同步并发** 时，建议在 **业务低峰** 执行定时任务，必要时可引入「对账窗口」或版本策略（实现阶段细化）。

---

## 7. 附录：外部反查（SCOW 有、外部无）与 user-sync 约定

当外部系统（如 **aix**）需要 **枚举 SCOW 侧用户** 并与本地比对、处理「SCOW 有、外部无」时，可采用 **不经租户列表** 的路径：

| 项 | 约定 |
|----|------|
| **分页枚举** | user-sync **`GET /v1/platform/users`**（`GetAllUsers`），默认 **`pageSize=200`**（最大 500），基础字段对账；**首期不对比** `blockedInCluster`。 |
| **按需详情** | **`GET /v1/users/:userId`**（`GetUserInfo`），响应 `{ "user": … }`；**仅待删/待处理候选**调用；与租户列表接口 **无依赖**。 |
| **鉴权** | 与 **`USER_SYNC_API_TOKEN`** 相同。 |
| **删除** | **`tenantName` 以单用户 GET 响应为准**；删除返回 **404** 视为 MIS 已无该用户、**视为已删除成功**（幂等）。 |
| **失败** | 分页或单用户 GET 失败 → **整单任务失败返回**。 |
| **平台账号** | 首期 **不自动排除**；由管理员决定是否删除。 |

完整条文与 REST 表见：[外部系统同步集成方案 — §7.1 反查对账](./external-system-sync.md#reverse-reconciliation-pagination)。

**aix 集成**：实现现状、反查伪流程与「管理 API」说明见 aix 工程内 `reconciliation-service.md` **§8**（及 `external-system-sync.md` **§7.2**）。
