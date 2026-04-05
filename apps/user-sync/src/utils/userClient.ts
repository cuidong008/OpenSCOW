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

import { ChannelCredentials, ClientOptions } from "@grpc/grpc-js";
import { UserServiceClient } from "@scow/protos/build/server/user";
import { config } from "src/config/env";

const clientOptions: ClientOptions | undefined = config.MIS_SCOW_API_TOKEN
  ? {
    callInvocationTransformer: (props) => {
      props.metadata.add("authorization", `Bearer ${config.MIS_SCOW_API_TOKEN}`);
      return props;
    },
  }
  : undefined;

export const userServiceClient = new UserServiceClient(
  config.MIS_SERVER_URL,
  ChannelCredentials.createInsecure(),
  clientOptions,
);
