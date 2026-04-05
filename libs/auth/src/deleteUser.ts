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

import { applicationJsonHeaders, logHttpErrorAndThrow } from "src/utils";
import { Logger } from "ts-log";

/**
 * 删除认证目录中的用户。404（目录中无此用户）视为成功，便于幂等与「仅 MIS 有记录」场景。
 */
export async function deleteUser(
  authUrl: string,
  params: { identityId: string },
  logger?: Logger,
) {
  const resp = await fetch(authUrl + "/user", {
    method: "DELETE",
    body: JSON.stringify({ identityId: params.identityId }),
    headers: applicationJsonHeaders,
  });

  if (resp.status === 204 || resp.status === 404) {
    return;
  }

  logHttpErrorAndThrow(resp, logger);
}
