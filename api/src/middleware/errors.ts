import { createErrorEnvelope } from '@ledgercraft/contracts';
import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { errorCodeFromCause } from '../http-error';
import type { AppEnv } from '../types';

function requestIdFrom(c: { get: (key: 'requestId') => string | undefined }): string {
  return c.get('requestId') ?? 'req_unknown';
}

export const errorHandler: ErrorHandler<AppEnv> = (error, c) => {
  const requestId = requestIdFrom(c);

  if (error instanceof ZodError) {
    return c.json(
      createErrorEnvelope('VALIDATION_ERROR', 'Request validation failed', requestId),
      400,
    );
  }

  if (error instanceof HTTPException) {
    const status = error.status;
    const code = errorCodeFromCause(
      error.cause,
      status === 404
        ? 'NOT_FOUND'
        : status === 401
          ? 'UNAUTHORIZED'
          : status === 403
            ? 'FORBIDDEN'
            : 'HTTP_ERROR',
    );
    return c.json(createErrorEnvelope(code, error.message, requestId), status);
  }

  console.error(
    JSON.stringify({
      msg: 'unhandled_error',
      requestId,
      name: error.name,
    }),
  );

  return c.json(
    createErrorEnvelope('INTERNAL_ERROR', 'An unexpected error occurred', requestId),
    500,
  );
};

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) => {
  return c.json(createErrorEnvelope('NOT_FOUND', 'Not found', requestIdFrom(c)), 404);
};
