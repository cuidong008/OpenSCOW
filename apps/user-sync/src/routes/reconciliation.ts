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

import { FastifyInstance } from "fastify";

export async function registerReconciliationRoutes(server: FastifyInstance) {

  server.post<{
    Body: {
      tenantName?: string;
      mode?: "full" | "incremental";
      dryRun?: boolean;
    };
  }>("/reconciliation/run", {
    schema: {
      body: {
        type: "object",
        properties: {
          tenantName: { type: "string" },
          mode: { type: "string", enum: ["full", "incremental"]},
          dryRun: { type: "boolean" },
        },
      },
    },
  }, async (_request, reply) => {
    return reply.code(501).send({
      error: {
        code: "NOT_IMPLEMENTED",
        message:
          "对账任务需对接外部权威数据源与批处理逻辑；当前版本仅保留 HTTP 契约占位，"
          + "详见 docs/docs/deploy/config/mis/reconciliation-service.md。",
      },
    });
  });

  server.get<{
    Params: { jobId: string };
  }>("/reconciliation/jobs/:jobId", {
    schema: {
      params: {
        type: "object",
        required: ["jobId"],
        properties: { jobId: { type: "string" } },
      },
    },
  }, async (_request, reply) => {
    return reply.code(501).send({
      error: {
        code: "NOT_IMPLEMENTED",
        message: "任务查询在对账服务实现可用后提供。",
      },
    });
  });
}
