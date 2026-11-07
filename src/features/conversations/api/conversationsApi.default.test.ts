import { afterEach, expect, it, vi } from 'vitest';
import { conversationsApiEnabled } from './conversationsApi';
afterEach(()=>vi.unstubAllEnvs());
it('uses the Hono conversation API by default after hosted Supabase removal',()=>{
 vi.stubEnv('VITE_CONVERSATIONS_API',undefined);expect(conversationsApiEnabled()).toBe(true);
 vi.stubEnv('VITE_CONVERSATIONS_API','true');expect(conversationsApiEnabled()).toBe(true);
 vi.stubEnv('VITE_CONVERSATIONS_API','false');expect(conversationsApiEnabled()).toBe(false);
});
