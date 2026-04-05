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
import { DeleteUserResult } from "src/auth/AuthProvider";

const BodySchema = Type.Object({
  identityId: Type.String({ description: "用户登录名" }),
});

const codes: Record<DeleteUserResult, number> = {
  NotFound: 404,
  OK: 204,
};

/**
 * 删除 LDAP 用户（及 newGroupPerUser 策略下的 posixGroup、从 addUserToLdapGroup 中移除 member）
 */
export const deleteUserRoute = fp(async (f) => {
  f.delete<{
    Body: Static<typeof BodySchema>
  }>(
    "/user",
    {
      schema: {
        body: BodySchema,
      },
    },
    async (req, rep) => {
      if (!f.auth.deleteUser) {
        return await rep.code(501).send({ code: "NOT_SUPPORTED" });
      }

      const { identityId } = req.body;
      const result = await f.auth.deleteUser(identityId, req);

      return await rep.code(codes[result]).send();
    },
  );
});
