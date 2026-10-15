import {
  chatCompletionResponseSchema,
  type ChatCompletionRequest,
  type ChatCompletionResponse,
} from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { apiError } from '../../http-error';
import { withOrganisationTx } from '../auth/bind-organisation';

export type ChatCompleter = {
  complete(messages: ChatCompletionRequest['messages']): Promise<string>;
};

export async function completeChatForUser(
  db: Database,
  userId: string,
  completer: ChatCompleter | undefined,
  input: ChatCompletionRequest,
): Promise<ChatCompletionResponse> {
  return withOrganisationTx(db, userId, async () => {
    if (!completer) {
      throw apiError(503, 'AI_UNAVAILABLE', 'Chat completions are not configured');
    }
    const content = await completer.complete(input.messages);
    return chatCompletionResponseSchema.parse({ content });
  });
}
