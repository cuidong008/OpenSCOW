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

import { ServiceError } from "@grpc/grpc-js";
import { status as grpcStatus } from "@grpc/grpc-js";
import { FastifyReply } from "fastify";

export function isServiceError(e: unknown): e is ServiceError {
  return typeof e === "object" && e !== null && "code" in e
    && typeof (e as ServiceError).code === "number";
}

export function sendGrpcError(reply: FastifyReply, e: unknown): void {
  if (!isServiceError(e)) {
    reply.code(500).send({
      error: {
        code: "INTERNAL",
        message: e instanceof Error ? e.message : String(e),
      },
    });
    return;
  }

  const code = e.code;
  const message = e.message || "gRPC error";

  const map: Partial<Record<number, number>> = {
    [grpcStatus.INVALID_ARGUMENT]: 400,
    [grpcStatus.NOT_FOUND]: 404,
    [grpcStatus.ALREADY_EXISTS]: 409,
    [grpcStatus.FAILED_PRECONDITION]: 412,
    [grpcStatus.PERMISSION_DENIED]: 403,
    [grpcStatus.UNAUTHENTICATED]: 401,
    [grpcStatus.UNIMPLEMENTED]: 501,
    [grpcStatus.UNAVAILABLE]: 503,
    [grpcStatus.INTERNAL]: 502,
  };

  const http = map[code] ?? 500;
  const name = grpcStatus[code] ?? "UNKNOWN";

  reply.code(http).send({
    error: {
      code: name,
      grpcCode: code,
      message,
      details: e.details,
    },
  });
}
