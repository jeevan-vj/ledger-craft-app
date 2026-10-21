import { createErrorEnvelope } from '@ledgercraft/contracts';
import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { routePath } from 'hono/route';
import { ZodError } from 'zod';
import { errorCodeFromCause } from '../http-error';
import { reportUnhandledError } from '../observability/report';
import { routeTemplateFrom } from '../observability/scrub';
import type { AppEnv } from '../types';

function requestIdFrom(c: { get: (key: 'requestId') => string | undefined }): string {
  return c.get('requestId') ?? 'req_unknown';
}

function matchedRoute(c: Parameters<ErrorHandler<AppEnv>>[1]): string {
  try {
    return routeTemplateFrom(routePath(c), c.req.path);
  } catch {
    return routeTemplateFrom(undefined, c.req.path);
  }
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

  reportUnhandledError(error, {
    source: 'hono',
    requestId,
    route: matchedRoute(c),
    userId: c.get('actorUserId'),
  });

  return c.json(
    createErrorEnvelope('INTERNAL_ERROR', 'An unexpected error occurred', requestId),
    500,
  );
};

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) => {
  return c.json(createErrorEnvelope('NOT_FOUND', 'Not found', requestIdFrom(c)), 404);
};
