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

import { asyncClientCall } from "@ddadaal/tsgrpc-client";
import { status as grpcStatus } from "@grpc/grpc-js";
import {
  GetAllUsersRequest_UsersSortField,
  SortDirection,
  UserRole,
} from "@scow/protos/build/server/user";
import { FastifyInstance } from "fastify";
import { config } from "src/config/env";
import { forwardAuthChangePassword } from "src/utils/authPassword";
import { isServiceError, sendGrpcError } from "src/utils/grpcError";
import { userServiceClient } from "src/utils/userClient";

function isUserRole(value: unknown, role: UserRole): boolean {
  return value === role || value === UserRole[role];
}

function formatCreateTime(t: unknown): string | undefined {
  if (t == null) {
    return undefined;
  }
  if (typeof t === "string") {
    return t;
  }
  if (typeof t === "object" && t !== null && "seconds" in t) {
    const s = Number((t as { seconds: number | bigint }).seconds);
    if (!Number.isNaN(s)) {
      return new Date(s * 1000).toISOString();
    }
  }
  return undefined;
}

interface AccountAffiliationRow {
  accountName: string;
  role: unknown;
}

/** 与 GET /v1/users 列表项同构（供单用户查询等复用） */
function buildUserListItem(params: {
  userId: string;
  tenantName: string;
  name: string;
  email: string;
  createTime: unknown;
  tenantRoles: unknown;
  platformRoles: unknown;
  accountRows: AccountAffiliationRow[];
}) {
  const { userId, tenantName, name, email, createTime, tenantRoles, platformRoles, accountRows } = params;

  const accountAffiliations = accountRows.map((a) => ({
    accountName: a.accountName,
    role: a.role,
    isAccountAdmin: isUserRole(a.role, UserRole.ADMIN),
    isAccountOwner: isUserRole(a.role, UserRole.OWNER),
  }));

  const isAccountAdminInAnyAccount = accountAffiliations.some((x) => x.isAccountAdmin);
  const isAccountOwnerInAnyAccount = accountAffiliations.some((x) => x.isAccountOwner);

  return {
    tenantName,
    userId,
    name,
    email,
    createTime: formatCreateTime(createTime) ?? createTime,
    tenantRoles,
    platformRoles,
    accountAffiliations,
    isAccountAdminInAnyAccount,
    isAccountOwnerInAnyAccount,
    hasAccountAdminOrOwnerRole: isAccountAdminInAnyAccount || isAccountOwnerInAnyAccount,
  };
}

const defaultPlatformPageSize = 200;
const maxPlatformPageSize = 500;

const sortFieldFromQuery: Record<string, GetAllUsersRequest_UsersSortField> = {
  userId: GetAllUsersRequest_UsersSortField.USER_ID,
  name: GetAllUsersRequest_UsersSortField.NAME,
  createTime: GetAllUsersRequest_UsersSortField.CREATE_TIME,
};

const sortOrderFromQuery: Record<string, SortDirection> = {
  asc: SortDirection.ASC,
  desc: SortDirection.DESC,
};

const externalStateSchema = {
  type: "string",
  enum: ["enabled", "disabled", "locked"],
} as const;

export async function registerV1UserRoutes(server: FastifyInstance) {

  server.get<{
    Querystring: {
      page?: string;
      pageSize?: string;
      sortField?: string;
      sortOrder?: string;
    };
  }>("/v1/platform/users", {
    schema: {
      querystring: {
        type: "object",
        properties: {
          page: { type: "string" },
          pageSize: { type: "string" },
          sortField: { type: "string", enum: ["userId", "name", "createTime"]},
          sortOrder: { type: "string", enum: ["asc", "desc"]},
        },
      },
    },
  }, async (request, reply) => {
    const q = request.query;
    const pageRaw = q.page !== undefined ? Number.parseInt(String(q.page), 10) : 1;
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

    const sizeRaw = q.pageSize !== undefined ? Number.parseInt(String(q.pageSize), 10) : defaultPlatformPageSize;
    const pageSize = Number.isFinite(sizeRaw) && sizeRaw >= 1
      ? Math.min(sizeRaw, maxPlatformPageSize)
      : defaultPlatformPageSize;

    const sortField = q.sortField !== undefined && q.sortField in sortFieldFromQuery
      ? sortFieldFromQuery[q.sortField]
      : GetAllUsersRequest_UsersSortField.USER_ID;

    const sortOrder = q.sortOrder !== undefined && q.sortOrder in sortOrderFromQuery
      ? sortOrderFromQuery[q.sortOrder]
      : SortDirection.ASC;

    try {
      const res = await asyncClientCall(userServiceClient, "getAllUsers", {
        page,
        pageSize,
        sortField,
        sortOrder,
      });

      return reply.send({
        page,
        pageSize,
        sortField: q.sortField ?? "userId",
        sortOrder: q.sortOrder ?? "asc",
        totalCount: Number(res.totalCount),
        platformUsers: res.platformUsers.map((u) => ({
          userId: u.userId,
          name: u.name,
          email: u.email,
          tenantName: u.tenantName,
          createTime: formatCreateTime(u.createTime) ?? u.createTime,
          platformRoles: u.platformRoles,
          availableAccounts: u.availableAccounts,
        })),
      });
    } catch (e) {
      sendGrpcError(reply, e);
      return;
    }
  });

  server.get<{
    Querystring: { tenantName: string };
  }>("/v1/users", {
    schema: {
      querystring: {
        type: "object",
        required: ["tenantName"],
        properties: { tenantName: { type: "string" } },
      },
    },
  }, async (request, reply) => {
    const { tenantName } = request.query;

    try {
      const res = await asyncClientCall(userServiceClient, "getUsers", { tenantName });

      const users = res.users.map((u) => buildUserListItem({
        userId: u.userId,
        tenantName: u.tenantName,
        name: u.name,
        email: u.email,
        createTime: u.createTime,
        tenantRoles: u.tenantRoles,
        platformRoles: u.platformRoles,
        accountRows: u.accountAffiliations,
      }));

      return reply.send({ tenantName, users });
    } catch (e) {
      sendGrpcError(reply, e);
      return;
    }
  });

  server.get<{
    Params: { userId: string };
  }>("/v1/users/:userId", {
    schema: {
      params: {
        type: "object",
        required: ["userId"],
        properties: { userId: { type: "string" } },
      },
    },
  }, async (request, reply) => {
    const { userId } = request.params;

    try {
      const info = await asyncClientCall(userServiceClient, "getUserInfo", { userId });

      const user = buildUserListItem({
        userId,
        tenantName: info.tenantName,
        name: info.name,
        email: info.email,
        createTime: info.createTime,
        tenantRoles: info.tenantRoles,
        platformRoles: info.platformRoles,
        accountRows: info.affiliations,
      });

      return reply.send({ user });
    } catch (e) {
      sendGrpcError(reply, e);
      return;
    }
  });

  server.delete<{
    Params: { userId: string };
    Querystring: { tenantName: string };
  }>("/v1/users/:userId", {
    schema: {
      params: {
        type: "object",
        required: ["userId"],
        properties: { userId: { type: "string" } },
      },
      querystring: {
        type: "object",
        required: ["tenantName"],
        properties: { tenantName: { type: "string" } },
      },
    },
  }, async (request, reply) => {
    const { userId } = request.params;
    const { tenantName } = request.query;

    try {
      await asyncClientCall(userServiceClient, "deleteUser", {
        tenantName,
        userId,
      });
      return reply.code(204).send();
    } catch (e) {
      sendGrpcError(reply, e);
      return;
    }
  });

  server.post<{
    Body: {
      tenantName: string;
      identityId: string;
      name: string;
      email: string;
      password: string;
    };
  }>("/v1/users", {
    schema: {
      body: {
        type: "object",
        required: ["tenantName", "identityId", "name", "email", "password"],
        properties: {
          tenantName: { type: "string" },
          identityId: { type: "string" },
          name: { type: "string" },
          email: { type: "string" },
          password: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const { tenantName, identityId, name, email, password } = request.body;

    try {
      const res = await asyncClientCall(userServiceClient, "createUser", {
        tenantName,
        identityId,
        name,
        email,
        password,
      });
      return reply.send({
        id: res.id,
        createdInAuth: res.createdInAuth,
      });
    } catch (e) {
      sendGrpcError(reply, e);
      return;
    }
  });

  server.patch<{
    Params: { userId: string };
    Body: { name?: string; email?: string };
  }>("/v1/users/:userId/profile", {
    schema: {
      params: {
        type: "object",
        required: ["userId"],
        properties: { userId: { type: "string" } },
      },
      body: {
        type: "object",
        minProperties: 1,
        properties: {
          name: { type: "string" },
          email: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const { userId } = request.params;
    const { name, email } = request.body;

    try {
      if (name !== undefined) {
        await asyncClientCall(userServiceClient, "changeName", {
          userId,
          newName: name,
        });
      }
      if (email !== undefined) {
        await asyncClientCall(userServiceClient, "changeEmail", {
          userId,
          newEmail: email,
        });
      }
      return reply.send({});
    } catch (e) {
      sendGrpcError(reply, e);
      return;
    }
  });

  server.patch<{
    Params: { userId: string };
    Body: { newPassword: string };
  }>("/v1/users/:userId/password", {
    schema: {
      params: {
        type: "object",
        required: ["userId"],
        properties: { userId: { type: "string" } },
      },
      body: {
        type: "object",
        required: ["newPassword"],
        properties: { newPassword: { type: "string" } },
      },
    },
  }, async (request, reply) => {
    const { userId } = request.params;
    const { newPassword } = request.body;

    if (!config.AUTH_INTERNAL_URL) {
      return reply.code(503).send({
        error: {
          code: "AUTH_INTERNAL_URL_NOT_SET",
          message: "AUTH_INTERNAL_URL is not configured; cannot forward password change to Auth.",
        },
      });
    }

    const result = await forwardAuthChangePassword(
      config.AUTH_INTERNAL_URL,
      userId,
      newPassword,
    );

    if (result.kind === "ok") {
      return reply.code(204).send();
    }

    const { status, message } = result;
    return reply.code(status >= 400 && status < 600 ? status : 502).send({
      error: {
        code: "AUTH_PASSWORD_CHANGE_FAILED",
        message,
        authStatus: status,
      },
    });
  });

  server.post<{
    Params: { userId: string };
    Body: { tenantName: string; externalState: "enabled" | "disabled" | "locked" };
  }>("/v1/users/:userId/cluster-state", {
    schema: {
      params: {
        type: "object",
        required: ["userId"],
        properties: { userId: { type: "string" } },
      },
      body: {
        type: "object",
        required: ["tenantName", "externalState"],
        properties: {
          tenantName: { type: "string" },
          externalState: externalStateSchema,
        },
      },
    },
  }, async (request, reply) => {
    const { userId } = request.params;
    const { tenantName, externalState } = request.body;

    const wantBlock = externalState === "disabled" || externalState === "locked";

    try {
      const info = await asyncClientCall(userServiceClient, "getUserInfo", { userId });

      if (info.tenantName !== tenantName) {
        return reply.code(400).send({
          error: {
            code: "TENANT_MISMATCH",
            message: `User belongs to tenant ${info.tenantName}, not ${tenantName}.`,
          },
        });
      }

      const actions: { accountName: string; action: "BLOCK" | "UNBLOCK" | "SKIP" }[] = [];

      for (const aff of info.affiliations) {
        const accountName = aff.accountName;
        try {
          if (wantBlock) {
            await asyncClientCall(userServiceClient, "blockUserInAccount", {
              tenantName,
              userId,
              accountName,
            });
            actions.push({ accountName, action: "BLOCK" });
          } else {
            await asyncClientCall(userServiceClient, "unblockUserInAccount", {
              tenantName,
              userId,
              accountName,
            });
            actions.push({ accountName, action: "UNBLOCK" });
          }
        } catch (e) {
          if (isServiceError(e) && e.code === grpcStatus.FAILED_PRECONDITION) {
            actions.push({ accountName, action: "SKIP" });
            continue;
          }
          throw e;
        }
      }

      return reply.send({
        userId,
        tenantName,
        externalState,
        accountsAffected: actions.filter((a) => a.action !== "SKIP").length,
        actions,
      });
    } catch (e) {
      sendGrpcError(reply, e);
      return;
    }
  });
}
