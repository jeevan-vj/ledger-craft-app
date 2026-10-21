import type {
  AddConversationMessageRequest,
  ConversationDto,
  ConversationListResponse,
  CreateConversationRequest,
  UpdateConversationRequest,
} from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';

export function conversationsApiEnabled(): boolean {
  return import.meta.env.VITE_CONVERSATIONS_API === 'true';
}

export class ConversationsApiError extends Error {
  readonly requestId?: string;

  constructor(
    message: string,
    readonly status: number,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ConversationsApiError';
    this.requestId = requestId;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (response.status === 204) return undefined as T;
  if (!response.ok) {
    const failure = await readApiFailure(response);
    throw new ConversationsApiError(failure.message, failure.status, failure.requestId);
  }
  return (await response.json()) as T;
}

export const conversationsApi = {
  async list(): Promise<ConversationDto[]> {
    const body = await request<ConversationListResponse>('/api/conversations');
    return body.conversations;
  },

  async get(id: string): Promise<ConversationDto | null> {
    try {
      return await request<ConversationDto>(`/api/conversations/${id}`);
    } catch (error) {
      if (error instanceof ConversationsApiError && error.status === 404) return null;
      throw error;
    }
  },

  async create(input: CreateConversationRequest): Promise<ConversationDto> {
    return request<ConversationDto>('/api/conversations', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async addMessage(id: string, input: AddConversationMessageRequest): Promise<ConversationDto> {
    return request<ConversationDto>(`/api/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async update(id: string, input: UpdateConversationRequest): Promise<ConversationDto> {
    return request<ConversationDto>(`/api/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  async remove(id: string): Promise<void> {
    await request<void>(`/api/conversations/${id}`, { method: 'DELETE' });
  },
};
