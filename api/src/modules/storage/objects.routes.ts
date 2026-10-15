import { uploadObjectRequestSchema } from '@ledgercraft/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { apiError } from '../../http-error';
import { requireSession } from '../auth/require-session';
import { createFilesystemObjectStore } from './filesystem';
import * as objectsService from './objects.service';

const fallbackStore = createFilesystemObjectStore();

function requireObjectStore(c: { get: (key: 'objectStore') => AppEnv['Variables']['objectStore'] }) {
  return c.get('objectStore') ?? fallbackStore;
}

export function objectRoutes() {
  const routes = new Hono<AppEnv>();

  for (const prefix of ['', '/api'] as const) {
    routes.post(`${prefix}/objects`, async (c) => {
      const { db, user } = await requireSession(c);
      const input = uploadObjectRequestSchema.parse(await c.req.json());
      return c.json(await objectsService.uploadObjectForUser(db, user.id, requireObjectStore(c), input), 201);
    });

    routes.get(`${prefix}/objects`, async (c) => {
      const { db, user } = await requireSession(c);
      const key = c.req.query('key');
      if (!key) throw apiError(400, 'VALIDATION_ERROR', 'Missing object key');
      const object = await objectsService.getObjectForUser(db, user.id, requireObjectStore(c), key);
      return new Response(Buffer.from(object.bytes), {
        status: 200,
        headers: {
          'Content-Type': object.contentType,
          'Content-Length': String(object.bytes.byteLength),
          'Cache-Control': 'private, max-age=60',
        },
      });
    });

    routes.delete(`${prefix}/objects`, async (c) => {
      const { db, user } = await requireSession(c);
      const key = c.req.query('key');
      if (!key) throw apiError(400, 'VALIDATION_ERROR', 'Missing object key');
      await objectsService.deleteObjectForUser(db, user.id, requireObjectStore(c), key);
      return c.body(null, 204);
    });
  }

  return routes;
}
