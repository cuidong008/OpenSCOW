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

import { FastifyRequest } from "fastify";
import ldapjs, { NoSuchObjectError } from "ldapjs";
import { DeleteUserResult } from "src/auth/AuthProvider";
import { findUser, searchOne, useLdap } from "src/auth/ldap/helpers";
import { LdapConfigSchema, NewUserGroupStrategy } from "src/config/auth";
import { RequiredBy } from "src/utils/validations";
import { promisify } from "util";

function isNoSuchObjectError(e: unknown): boolean {
  if (e instanceof NoSuchObjectError) {
    return true;
  }
  return typeof e === "object" && e !== null && (e as { code?: number }).code === 32;
}

export async function deleteUser(
  identityId: string,
  req: FastifyRequest,
  ldap: RequiredBy<LdapConfigSchema, "addUser">,
): Promise<DeleteUserResult> {

  return await useLdap(req.log, ldap)(async (client) => {
    const user = await findUser(req.log, ldap, client, identityId);
    if (!user) {
      return "NotFound";
    }

    const userDn = user.dn;

    const addUserToLdapGroup = ldap.addUser.addUserToLdapGroup;
    if (addUserToLdapGroup) {
      const members = await searchOne(req.log, client, addUserToLdapGroup, {
        scope: "base",
        attributes: ["member"],
      }, (entry) => {
        const member = entry.attributes.find((x) => x.json.type === "member");
        if (!member) {
          return undefined;
        }
        const vals = member.json.vals;
        const members = Array.isArray(vals) ? vals : [vals as string];
        return { members };
      });

      if (members?.members?.includes(userDn)) {
        const modify = promisify(client.modify.bind(client));
        await modify(addUserToLdapGroup, new ldapjs.Change({
          operation: "delete",
          modification: {
            member: userDn,
          },
        }));
      } else if (!members) {
        req.log.warn("LDAP group %s not found when deleting user; skipping auxiliary group member removal",
          addUserToLdapGroup);
      }
    }

    const del = promisify(client.del.bind(client));
    try {
      await del(userDn);
    } catch (e: unknown) {
      if (isNoSuchObjectError(e)) {
        return "NotFound";
      }
      throw e;
    }

    if (ldap.addUser.groupStrategy === NewUserGroupStrategy.newGroupPerUser) {
      const config = ldap.addUser.newGroupPerUser!;
      const groupDn =
        `${config.groupIdDnKey ?? ldap.attrs.uid}=${identityId},${config.groupBase}`;
      try {
        await del(groupDn);
      } catch (e: unknown) {
        if (!isNoSuchObjectError(e)) {
          req.log.error(e, "Failed to delete user's posixGroup %s", groupDn);
          throw e;
        }
      }
    }

    return "OK";
  });
}
