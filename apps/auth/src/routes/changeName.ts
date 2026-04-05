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
import { ChangeNameResult } from "src/auth/AuthProvider";

const BodySchema = Type.Object({
  identityId: Type.String({ description: "用户ID" }),
  newName: Type.String({ description: "新姓名（目录中 attrs.name，如 cn）" }),
});

const ResponsesSchema = Type.Object({
  204: Type.Null({ description: "修改完成" }),
  404: Type.Null({ description: "用户未找到" }),
  501: Type.Null({ description: "不支持修改姓名功能" }),
});

const codes: Record<ChangeNameResult, number> = {
  NotFound: 404,
  OK: 204,
};

/**
 * 修改 LDAP 显示名（与 ldap.attrs.name 一致，如 cn）
 */
export const changeNameRoute = fp(async (f) => {
  f.patch<{
    Body: Static<typeof BodySchema>
    Responses: Static<typeof ResponsesSchema>,
  }>(
    "/user/name",
    {
      schema: {
        body: BodySchema,
        response: ResponsesSchema.properties,
      },
    },
    async (req, rep) => {

      if (!f.auth.changeName) {
        return await rep.code(501).send({ code: "NOT_SUPPORTED" });
      }

      const { identityId, newName } = req.body;

      const result = await f.auth.changeName(identityId, newName, req);

      await rep.code(codes[result]).send(null);
    },
  );
});
