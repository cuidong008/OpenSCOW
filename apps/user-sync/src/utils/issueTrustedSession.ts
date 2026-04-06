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

import { config } from "src/config/env";

export type IssueTrustedSessionResult =
  | { kind: "ok"; token: string }
  | { kind: "error"; status: number; message: string }
  | { kind: "not_configured"; message: string };

/** 调用 Auth POST /internal/trusted/session-token，使用与 USER_SYNC_API_TOKEN 相同的 Bearer。 */
export async function issueTrustedSessionToken(identityId: string): Promise<IssueTrustedSessionResult> {
  const authBase = config.AUTH_INTERNAL_URL?.trim();
  if (!authBase) {
    return { kind: "not_configured", message: "AUTH_INTERNAL_URL is not set." };
  }

  const bearer = config.USER_SYNC_API_TOKEN;
  const base = authBase.replace(/\/$/, "");
  const resp = await fetch(`${base}/internal/trusted/session-token`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({ identityId }),
  });

  if (resp.status === 503) {
    const j = (await resp.json().catch(() => ({}))) as { message?: string };
    return {
      kind: "not_configured",
      message: j.message ?? "Auth trusted session token is not configured.",
    };
  }

  if (!resp.ok) {
    const text = await resp.text();
    let message = `Auth HTTP ${resp.status}`;
    try {
      const j = JSON.parse(text) as { message?: string; code?: string };
      message = j.message ?? j.code ?? message;
    } catch {
      if (text) {
        message = text.slice(0, 200);
      }
    }
    return { kind: "error", status: resp.status, message };
  }

  const body = (await resp.json()) as { token?: string };
  if (!body.token || typeof body.token !== "string") {
    return { kind: "error", status: 502, message: "Auth returned no token." };
  }
  return { kind: "ok", token: body.token };
}
