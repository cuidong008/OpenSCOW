/**
 * Copyright (c) 2022 Peking University and Peking University Institute for Computing and Digital Economy
 * OpenSCOW is licensed under Mulan PSL v2.
 * You can use this software according to the terms and conditions of the Mulan PSL v2.
 * You may obtain a copy of Mulan PSL v2 at:
 *          http://license.coscl.org.cn/MulanPSL2
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND,
 * EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT,
 * MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
 * See the Mulan PSL v2 for more details.
 */

import { bool, envConfig, host, port, str } from "@scow/lib-config";

export const config = envConfig({
  HOST: host({ default: "0.0.0.0", desc: "HTTP 监听地址" }),
  PORT: port({ default: 8080, desc: "HTTP 监听端口" }),
  LOG_LEVEL: str({ default: "info", desc: "日志等级" }),
  LOG_PRETTY: bool({ desc: "以可读方式输出 log", default: false }),

  MIS_SERVER_URL: str({ desc: "mis-server gRPC 地址，如 mis-server:5000" }),
  MIS_SCOW_API_TOKEN: str({
    default: undefined,
    desc: "调用 MIS gRPC 时在 metadata 中携带的 Bearer Token（与 common.yaml 中 scowApi 一致时必填）",
  }),

  USER_SYNC_API_TOKEN: str({
    desc: "外部系统调用本网关时在 Authorization: Bearer 中使用的共享密钥",
  }),

  AUTH_INTERNAL_URL: str({
    default: undefined,
    desc: "Auth 内网根 URL（如 http://auth:5000），用于 PATCH /v1/users/:userId/password 转发至 Auth PATCH /password",
  }),
});
