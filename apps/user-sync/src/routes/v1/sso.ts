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
import { issueTrustedSessionToken } from "src/utils/issueTrustedSession";

export async function registerV1SsoRoutes(server: FastifyInstance) {
  server.post<{
    Body: { identityId: string };
  }>("/v1/sso/session-token", {
    schema: {
      body: {
        type: "object",
        required: ["identityId"],
        properties: {
          identityId: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const { identityId } = request.body;
    const result = await issueTrustedSessionToken(identityId);

    if (result.kind === "not_configured") {
      return reply.code(503).send({
        error: {
          code: "SSO_NOT_CONFIGURED",
          message: result.message,
        },
      });
    }
    if (result.kind === "error") {
      const code = result.status === 401 ? "AUTH_UNAUTHORIZED" : "AUTH_SESSION_ISSUE_FAILED";
      return reply.code(result.status >= 400 && result.status < 600 ? result.status : 502).send({
        error: {
          code,
          message: result.message,
        },
      });
    }
    return reply.send({ token: result.token });
  });
}
