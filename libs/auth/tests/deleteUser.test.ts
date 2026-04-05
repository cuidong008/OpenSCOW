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

import { applicationJsonHeaders } from "src/utils";
import { mockFetch } from "tests/utils";

import { deleteUser } from "../src/deleteUser";

const authUrl = "auth:5000";
const identityId = "u1";

mockFetch((input, init) => {
  const body = JSON.parse(init!.body as string);
  if (body.identityId === "missing") {
    return { status: 404 };
  }
  if (body.identityId === "fail") {
    return { status: 500 };
  }
  return { status: 204 };
});

it("calls DELETE /user with identityId", async () => {
  await deleteUser(authUrl, { identityId });

  expect(fetch).toHaveBeenCalledWith(
    authUrl + "/user",
    {
      method: "DELETE",
      body: JSON.stringify({ identityId }),
      headers: applicationJsonHeaders,
    },
  );
});

it("treats 404 as success", async () => {
  await deleteUser(authUrl, { identityId: "missing" });
});

it("throws on other errors", async () => {
  await expect(deleteUser(authUrl, { identityId: "fail" })).rejects.toBeDefined();
});
