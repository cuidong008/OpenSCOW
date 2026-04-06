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

import { join, normalize } from "path";

/**
 * Join URL path segments for browser paths (e.g. Next.js basePath + "/api/...").
 * Unlike Node {@link join}, a leading `/` on a later segment does **not** discard the base
 * (`path.join("/hpc", "/api/x")` incorrectly becomes `/api/x`).
 */
export function joinUrlPath(base: string, ...parts: string[]): string {
  let out = base.trim();
  if (!out || out === "/") {
    out = "";
  } else {
    out = out.replace(/\/+$/, "").replace(/^\/+/, "");
  }
  for (const part of parts) {
    const seg = String(part).replace(/^\/+|\/+$/g, "");
    if (!seg) continue;
    out = out ? `${out}/${seg}` : seg;
  }
  return out ? `/${out}` : "/";
}

/**
 * Append a path segment to an internal service base URL.
 * Use {@link joinUrlPath} semantics for the path (so a leading `/` on `pathSegment` does not drop the base path).
 *
 * For `http://` / `https://` bases, pathname is merged via {@link joinUrlPath}.
 * Bare bases like `auth:5000` are **not** valid hierarchical URLs for `new URL()`;
 * they are concatenated safely instead.
 */
export function joinServiceBaseUrl(baseUrl: string, pathSegment: string): string {
  const trimmed = baseUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const u = new URL(trimmed);
    u.pathname = joinUrlPath(u.pathname, pathSegment);
    return u.toString();
  }
  return `${trimmed.replace(/\/+$/, "")}${joinUrlPath("/", pathSegment)}`;
}

/**
 * Join paths to base url or pathname
 * @param base base url. can be a URL or a pathname
 * @param paths other paths
 * @returns joined url
 */
export function joinWithUrl(base: string, ...paths: string[]) {
  // strip protocol

  const protocolIndex = base.indexOf("://");

  const protocol = protocolIndex === -1 ? "" : base.slice(0, protocolIndex + "://".length);
  const noProtocol = base.slice(protocol.length);

  // strip querystring
  const qsIndex = noProtocol.indexOf("?");

  const pathname = noProtocol.slice(0, qsIndex === -1 ? undefined : qsIndex);
  const query = qsIndex === -1 ? "" : noProtocol.slice(qsIndex);

  // URL pathname starting with `/` must not use path.join: path.join("/hpc", "/api") drops "/hpc".
  const joinedPathname = pathname.startsWith("/")
    ? normalize(joinUrlPath(pathname, ...paths))
    : normalize(join(pathname, ...paths));

  return protocol + joinedPathname + query;
}

/**
 * Normalize pathname with query
 * @param pathnameWithQuery pathname possibly with query
 * @returns normalized pathname
 */
export function normalizePathnameWithQuery(pathnameWithQuery: string) {
  // strip querystring
  const qsIndex = pathnameWithQuery.indexOf("?");

  const pathname = pathnameWithQuery.slice(0, qsIndex === -1 ? undefined : qsIndex);
  const qs = qsIndex === -1 ? "" : pathnameWithQuery.slice(qsIndex);

  return normalize(pathname) + qs;
}

/**
 * Remove port from address
 * @param address IP address or hostname possibly with port
 * @returns address without port
 */
export function removePort(address: string): string {
  // Remove :port if present
  return address.replace(/:\d+$/, "");
}

