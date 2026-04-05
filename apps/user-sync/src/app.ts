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

import { readVersionFile } from "@scow/utils/build/version";
import fastify, { FastifyBaseLogger, FastifyInstance } from "fastify";
import { config } from "src/config/env";
import { registerHealthRoutes } from "src/routes/health";
import { registerReconciliationRoutes } from "src/routes/reconciliation";
import { registerV1UserRoutes } from "src/routes/v1/users";
import { logger } from "src/utils/logger";

export function buildApp(): FastifyInstance {

  const server = fastify({
    logger: logger as FastifyBaseLogger,
  });

  server.log.info({ version: readVersionFile() }, "@scow/user-sync");
  server.log.info({
    host: config.HOST,
    port: config.PORT,
    misServerUrl: config.MIS_SERVER_URL,
    misScowApiTokenSet: Boolean(config.MIS_SCOW_API_TOKEN),
    userSyncApiTokenSet: Boolean(config.USER_SYNC_API_TOKEN),
    authInternalUrlSet: Boolean(config.AUTH_INTERNAL_URL),
  }, "Loaded env config");

  server.addHook("preHandler", async (request, reply) => {
    const path = request.url.split("?")[0];
    if (path === "/health") {
      return;
    }

    const expected = `Bearer ${config.USER_SYNC_API_TOKEN}`;
    const authz = request.headers.authorization;
    if (authz !== expected) {
      return reply.code(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or invalid Authorization Bearer token.",
        },
      });
    }
  });

  void server.register(registerHealthRoutes);
  void server.register(registerV1UserRoutes);
  void server.register(registerReconciliationRoutes);

  return server;
}

export async function startServer(server: FastifyInstance) {
  await server.listen({ port: config.PORT, host: config.HOST });
}
