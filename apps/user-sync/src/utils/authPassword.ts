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

/** 与 mis-web / portal 调用的 Auth PATCH /password 一致；不在日志中打印密码。 */
export async function forwardAuthChangePassword(
  authInternalUrl: string,
  identityId: string,
  newPassword: string,
): Promise<{ kind: "ok" } | { kind: "error"; status: number; message: string }> {
  const base = authInternalUrl.replace(/\/$/, "");
  const resp = await fetch(`${base}/password`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identityId, newPassword }),
  });

  if (resp.status === 204) {
    return { kind: "ok" };
  }

  const text = await resp.text();
  let message = `Auth HTTP ${resp.status}`;
  try {
    const j = JSON.parse(text) as { code?: string; message?: string };
    message = j.message ?? j.code ?? message;
    if (typeof message !== "string") {
      message = text.slice(0, 200);
    }
  } catch {
    if (text) {
      message = text.slice(0, 200);
    }
  }

  return { kind: "error", status: resp.status, message };
}
