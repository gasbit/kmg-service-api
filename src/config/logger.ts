import pino, { type DestinationStream, type LoggerOptions } from "pino";
import pinoHttp from "pino-http";

import { env } from "./env";

const sensitiveFields = [
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "jwt",
  "secret",
  "customerName",
  "customerPhone",
  "customerAddress",
  "phone",
  "address",
] as const;

const sensitivePaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-api-key']",
  "res.headers['set-cookie']",
  ...sensitiveFields.flatMap((field) => [field, `*.${field}`, `*.*.${field}`]),
];

const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: sensitivePaths,
    censor: "[REDACTED]",
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
};

export function createLogger(destination?: DestinationStream) {
  return destination ? pino(loggerOptions, destination) : pino(loggerOptions);
}

export const logger = createLogger();

const requestPath = (url?: string) => url?.split("?", 1)[0] ?? "";

export const httpLogger = pinoHttp({
  logger,
  genReqId: (request, response) => {
    const responseRequestId = response.getHeader("x-request-id");
    return request.id ?? responseRequestId?.toString();
  },
  customProps: (_request, response) => ({
    requestId: response.getHeader("x-request-id")?.toString(),
  }),
  customLogLevel: (_request, response, error) => {
    if (error || response.statusCode >= 500) return "error";
    if (response.statusCode >= 400) return "warn";
    return "info";
  },
  serializers: {
    req: (request) => ({
      id: request.id,
      method: request.method,
      url: requestPath(request.url),
      remoteAddress: request.remoteAddress,
      remotePort: request.remotePort,
    }),
    res: (response) => ({ statusCode: response.statusCode }),
  },
  customSuccessMessage: (request) => `${request.method} ${requestPath(request.url)} completed`,
  customErrorMessage: (request) => `${request.method} ${requestPath(request.url)} failed`,
});
