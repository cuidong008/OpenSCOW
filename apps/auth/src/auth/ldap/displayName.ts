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

import { FastifyBaseLogger } from "fastify";
import ldapjs from "ldapjs";
import { useLdap } from "src/auth/ldap/helpers";
import { LdapConfigSchema } from "src/config/auth";
import { promisify } from "util";

function handleIfInvalidCredentials(e: any) {
  if (e.message === "Invalid Credentials") {
    return false;
  } else {
    throw e;
  }
}

export async function modifyDisplayName(
  userDn: string, attrName: string, newValue: string, client: ldapjs.Client,
): Promise<boolean> {
  try {
    const modify = promisify(client.modify.bind(client));
    await modify(userDn, new ldapjs.Change({
      operation: "replace",
      modification: {
        [attrName]: newValue,
      },
    }));
    return true;
  } catch (e: any) {
    return handleIfInvalidCredentials(e);
  }
}

export async function modifyDisplayNameAsSelf(
  log: FastifyBaseLogger,
  ldap: LdapConfigSchema,
  userDn: string,
  attrName: string,
  newValue: string,
): Promise<boolean> {
  try {
    return await useLdap(log, ldap)(async (client) => {
      await modifyDisplayName(userDn, attrName, newValue, client);
      return true;
    });
  } catch (e: any) {
    return handleIfInvalidCredentials(e);
  }
}
