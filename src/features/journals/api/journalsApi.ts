import { readApiFailure } from '@/lib/api/readApiError';
import type {
  CreateJournalEntryRequest,
  JournalEntryDto,
  JournalEntryListResponse,
  UpdateJournalEntryRequest,
} from '@ledgercraft/contracts';

export function journalsApiEnabled(): boolean {
  return import.meta.env.VITE_JOURNALS_API !== 'false';
}

export class JournalsApiError extends Error {
  readonly requestId?: string;

  constructor(
    message: string,
    readonly status: number,
    requestId?: string,
  ) {
    super(message);
    this.name = 'JournalsApiError';
    this.requestId = requestId;
  }
}

export type JournalEntryRow = {
  id: string;
  userId: string;
  entryNumber: string;
  entryDate: string;
  description: string;
  referenceNumber: string | null;
  debitAccountId: string;
  debitAccountName: string;
  debitAmount: number;
  creditAccountId: string;
  creditAccountName: string;
  creditAmount: number;
  status: JournalEntryDto['status'];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

function toRow(dto: JournalEntryDto): JournalEntryRow {
  return {
    id: dto.id,
    userId: '',
    entryNumber: dto.entryNumber,
    entryDate: dto.entryDate,
    description: dto.description,
    referenceNumber: dto.referenceNumber,
    debitAccountId: dto.debitAccountId,
    debitAccountName: dto.debitAccountName,
    debitAmount: Number(dto.debitAmount),
    creditAccountId: dto.creditAccountId,
    creditAccountName: dto.creditAccountName,
    creditAmount: Number(dto.creditAmount),
    status: dto.status,
    notes: dto.notes,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    createdBy: '',
  };
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
    throw new JournalsApiError(failure.message, failure.status, failure.requestId);
  }
  return (await response.json()) as T;
}

export const journalsApi = {
  async list(): Promise<JournalEntryRow[]> {
    const body = await request<JournalEntryListResponse>('/api/journal-entries');
    return body.journalEntries.map(toRow);
  },

  async create(input: CreateJournalEntryRequest): Promise<JournalEntryRow> {
    return toRow(
      await request<JournalEntryDto>('/api/journal-entries', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  },

  async update(id: string, input: UpdateJournalEntryRequest): Promise<JournalEntryRow> {
    return toRow(
      await request<JournalEntryDto>(`/api/journal-entries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    );
  },

  async remove(id: string): Promise<void> {
    await request<void>(`/api/journal-entries/${id}`, { method: 'DELETE' });
  },
};
