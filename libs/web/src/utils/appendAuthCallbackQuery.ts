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

/**
 * Append `/api/auth/callback?token=...` to a MIS/portal base URL.
 * Do not use Node `path.join`: `path.join('/hpc', '/api/...')` discards `/hpc` because the second segment is absolute.
 */
export function appendAuthCallbackQuery(base: string, token: string): string {
  if (/^https?:\/\//i.test(base)) {
    const u = new URL(base);
    u.pathname = `${u.pathname.replace(/\/$/, "")}/api/auth/callback`;
    u.search = "";
    u.searchParams.set("token", token);
    return u.toString();
  }
  return `${base.replace(/\/$/, "")}/api/auth/callback?token=${encodeURIComponent(token)}`;
}
