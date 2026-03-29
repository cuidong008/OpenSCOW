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
 * Create a json file at the specified path
 * containing the commit number and tag number of current commit
 *
 * Usage:
 *   node scripts/createVersionFile.mjs [json file path]
 *
 *   e.g. node scripts/createVersionFile.mjs version.json
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

let outputFile = process.argv[2] || "version.json";

function readPackageVersion() {
  return JSON.parse(readFileSync("package.json", "utf-8")).version || "0.0.0";
}

let tag;
let commit;

try {
  const exec = (cmd) =>
    execSync(cmd, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
  const tags = exec("git tag --points-at HEAD")
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
  tag = tags[0];
  commit = exec("git rev-parse HEAD").trim();
} catch {
  tag = readPackageVersion();
  commit = "unknown";
}

const versionObject = {
  tag: tag || readPackageVersion(),
  commit,
};

writeFileSync(outputFile, JSON.stringify(versionObject));
