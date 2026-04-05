---
sidebar_position: 4
title: 改密同步（外部系统 → Auth）
---

# 改密同步方案（外部系统 → OpenSCOW）

本文档说明：**外部系统（如 aix）** 在用户修改登录密码后，如何将新密码同步到 **OpenSCOW Auth**（及背后 LDAP），与 [外部系统同步集成方案](./external-system-sync.md) 配套使用。

## 1. 目标

- 外部系统本地改密 **成功并提交** 后，若已启用 `openscow.enabled`，则 **异步** 调用 SCOW 侧 **user-sync** 接口，使 **Auth 目录中的密码** 与外部一致。
- **不**为 Slurm 单独增加「改密 API」：集群节点若通过 **LDAP/SSSD** 与 Auth 一致，更新 Auth 后登录密码即与集群侧一致（与 MIS 门户改密行为一致）。

## 2. 待确认 / 默认假设

| 项 | 默认假设 |
|----|----------|
| Auth 能力 | 部署已启用 **LDAP 改密**（与 MIS 网页「修改密码」相同前提）；若 Auth 返回 **501**（不支持改密），外部仅打日志，需人工或运维对齐。 |
| 密码策略 | 新密码须满足 SCOW **Auth / 公共配置** 中的密码规则；不满足时 Auth 可能返回 **400**，外部记录失败日志，**不回滚** 本地已改密。 |
| 用户不存在于 SCOW | Auth 返回 **404**；与「先注册同步、再改密」一致；可通过对账补建用户后再改密。 |
| 传输安全 | 生产环境建议 **HTTPS** 或集群内加密；**禁止在日志中输出明文密码或 Token**。 |

## 3. SCOW 侧接口（user-sync）

网关将请求 **转发到既有 Auth HTTP 接口**：`PATCH {AUTH_INTERNAL_URL}/password`，请求体 `{ "identityId", "newPassword" }`，与 mis-web / portal 改密同源。

| 方法 | 路径 | 请求体（JSON） | 成功 | 说明 |
|------|------|----------------|------|------|
| `PATCH` | `/v1/users/:userId/password` | `newPassword`（字符串） | **204** 无响应体 | `:userId` 即登录名，与 `identityId` 一致 |

**环境变量**：`AUTH_INTERNAL_URL`（如 `http://auth:5000`），与 mis-web 的 Auth 内网地址一致；Docker Compose 由 `openscow-cli` 与 `mis-web` 同源注入。

**鉴权**：与其它 user-sync 接口相同，`Authorization: Bearer <USER_SYNC_API_TOKEN>`。

## 4. 外部系统（aix）行为

- 在 **用户改密事务提交成功后**（如 `UpdatePassword`、邮箱验证码 `ResetPassword`）**异步**调用 `PATCH …/v1/users/{username}/password`。
- 失败：**重试**（与现有同步相同的 `retryMax` / `retryIntervalMs`），仍失败则 **仅日志** + 告警，**不**回滚本地密码；最终一致可依赖人工或后续对账策略（密码通常不对账，以事件同步为准）。

## 5. 与「老流程」的关系

- SCOW **内部**改密一直是：**mis-web / portal → `PATCH` Auth `/password`**。
- 本方案仅在 **user-sync** 上增加 **同一 Auth 调用** 的对外入口，**不**新增 MIS gRPC、**不**重复实现 LDAP 逻辑。
