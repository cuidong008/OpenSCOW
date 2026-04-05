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

import { Static, Type } from "@sinclair/typebox";
import fp from "fastify-plugin";
import { cacheInfo } from "src/auth/cacheInfo";
import { config } from "src/config/env";

const BodySchema = Type.Object({
  identityId: Type.String({ description: "SCOW / LDAP 用户 ID，与登录名一致" }),
});

const ResponsesSchema = Type.Object({
  200: Type.Object({
    token: Type.String({ description: "供门户或 MIS /api/auth/callback 使用的短期 token" }),
  }),
  401: Type.Object({
    code: Type.Literal("UNAUTHORIZED"),
    message: Type.String(),
  }),
  503: Type.Object({
    code: Type.Literal("NOT_CONFIGURED"),
    message: Type.String(),
  }),
});

/**
 * 内网受信调用：签发与 LDAP 登录成功后相同的 Redis session token。
 * 需配置环境变量 TRUSTED_SESSION_ISSUE_TOKEN；请求头 Authorization: Bearer <同值>。
 * 由 user-sync 等内网组件调用，禁止对公网暴露 Auth 此路径。
 */
export const trustedSessionTokenRoute = fp(async (f) => {
  f.post<{
    Body: Static<typeof BodySchema>
    Responses: Static<typeof ResponsesSchema>,
  }>(
    "/internal/trusted/session-token",
    {
      schema: {
        body: BodySchema,
        response: ResponsesSchema.properties,
      },
    },
    async (req, rep) => {
      const expected = config.TRUSTED_SESSION_ISSUE_TOKEN?.trim();
      if (!expected) {
        return await rep.code(503).send({
          code: "NOT_CONFIGURED",
          message: "TRUSTED_SESSION_ISSUE_TOKEN is not set on auth service.",
        });
      }

      const authz = req.headers.authorization;
      if (authz !== `Bearer ${expected}`) {
        return await rep.code(401).send({
          code: "UNAUTHORIZED",
          message: "Missing or invalid Authorization Bearer token.",
        });
      }

      const { identityId } = req.body;
      const token = await cacheInfo(identityId, req);
      return await rep.status(200).send({ token });
    },
  );
});
