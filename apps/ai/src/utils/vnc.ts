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

import { joinUrlPath, joinWithUrl } from "@scow/utils";

export const openDesktop = (basePath: string,
  novncClientUrl: string, clusterId: string, node: string, port: number, password: string) => {

  const params = new URLSearchParams({
    path: joinUrlPath(basePath || "/", "api/proxy", clusterId, "absolute", node, String(port)),
    host: location.hostname,
    port: location.port,
    password: password,
    autoconnect: "true",
    reconnect: "true",
    resize: "remote",
  });

  const vncUrl = joinWithUrl(novncClientUrl, "/vnc.html");
  window.open(vncUrl + "?" + params.toString(), "_blank");
};
