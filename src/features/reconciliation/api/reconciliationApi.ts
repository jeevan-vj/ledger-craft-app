import type {
  BookEntryDto,
  CreateReconciliationAdjustmentRequest,
  CreateReconciliationMatchRequest,
  CreateReconciliationSessionRequest,
  ReconciliationAdjustmentDto,
  ReconciliationMatchDto,
  ReconciliationSessionDto,
  ReconciliationSessionListResponse,
} from '@ledgercraft/contracts';
import { readApiFailure } from '@/lib/api/readApiError';
import type {
  MatchableItem,
  ReconciliationAdjustment,
  ReconciliationMatch,
  ReconciliationSession,
  ReconciliationSetup,
  SuggestedMatch,
} from '@/types/reconciliation';

export function reconciliationApiEnabled(): boolean {
  return import.meta.env.VITE_RECONCILIATION_API === 'true';
}

export class ReconciliationApiError extends Error {
  readonly requestId?: string;

  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ReconciliationApiError';
    this.requestId = requestId;
  }
}

export function toSession(dto: ReconciliationSessionDto): ReconciliationSession {
  return {
    id: dto.id,
    bankAccountId: dto.bankAccountId,
    userId: '',
    statementStartDate: dto.statementStartDate,
    statementEndDate: dto.statementEndDate,
    statementOpeningBalance: Number(dto.statementOpeningBalance),
    statementClosingBalance: Number(dto.statementClosingBalance),
    bookOpeningBalance: Number(dto.bookOpeningBalance),
    bookClosingBalance: dto.bookClosingBalance == null ? null : Number(dto.bookClosingBalance),
    totalDeposits: Number(dto.totalDeposits),
    totalWithdrawals: Number(dto.totalWithdrawals),
    status: dto.status,
    reconciledAt: dto.reconciledAt,
    matchedCount: dto.matchedCount,
    unmatchedBankCount: dto.unmatchedBankCount,
    unmatchedBookCount: dto.unmatchedBookCount,
    adjustmentCount: dto.adjustmentCount,
    difference: Number(dto.difference),
    notes: dto.notes,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function toMatch(dto: ReconciliationMatchDto): ReconciliationMatch {
  return {
    id: dto.id,
    reconciliationId: dto.reconciliationId,
    bankTransactionId: dto.bankTransactionId,
    invoiceId: dto.invoiceId,
    paymentId: dto.paymentId,
    expenseId: dto.expenseId,
    journalEntryId: dto.journalEntryId,
    matchType: dto.matchType,
    confidenceScore: dto.confidenceScore,
    bankAmount: dto.bankAmount == null ? null : Number(dto.bankAmount),
    bookAmount: dto.bookAmount == null ? null : Number(dto.bookAmount),
    difference: Number(dto.difference),
    status: dto.status,
    notes: dto.notes,
    matchedBy: null,
    matchedAt: dto.matchedAt,
    createdAt: dto.createdAt,
  };
}

export function toAdjustment(dto: ReconciliationAdjustmentDto): ReconciliationAdjustment {
  return {
    id: dto.id,
    reconciliationId: dto.reconciliationId,
    userId: '',
    adjustmentType: dto.adjustmentType,
    description: dto.description,
    amount: Number(dto.amount),
    affectsBank: dto.affectsBank,
    affectsBook: dto.affectsBook,
    referenceType: null,
    referenceId: null,
    referenceNumber: dto.referenceNumber,
    journalEntryId: null,
    status: dto.status,
    appliedAt: dto.appliedAt,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function toBookEntry(dto: BookEntryDto): MatchableItem {
  return {
    id: dto.id,
    type: dto.type,
    date: dto.date,
    description: dto.description,
    amount: Number(dto.amount),
    reference: dto.reference ?? undefined,
    isReconciled: false,
  };
}

export function toCreateSessionRequest(setup: ReconciliationSetup): CreateReconciliationSessionRequest {
  return {
    bankAccountId: setup.bankAccountId,
    statementStartDate: setup.statementStartDate,
    statementEndDate: setup.statementEndDate,
    statementOpeningBalance: String(setup.statementOpeningBalance),
    statementClosingBalance: String(setup.statementClosingBalance),
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
  if (response.status === 204) {
    return undefined as T;
  }
  if (!response.ok) {
    const failure = await readApiFailure(response);
    throw new ReconciliationApiError(failure.message, failure.status, failure.code, failure.requestId);
  }
  return (await response.json()) as T;
}

export const reconciliationApi = {
  async listSessions(bankAccountId?: string): Promise<ReconciliationSession[]> {
    const query = bankAccountId ? `?bankAccountId=${encodeURIComponent(bankAccountId)}` : '';
    const body = await request<ReconciliationSessionListResponse>(`/api/reconciliation-sessions${query}`);
    return body.sessions.map(toSession);
  },

  async getSession(id: string): Promise<ReconciliationSession | null> {
    try {
      return toSession(await request<ReconciliationSessionDto>(`/api/reconciliation-sessions/${id}`));
    } catch (error) {
      if (error instanceof ReconciliationApiError && error.status === 404) return null;
      throw error;
    }
  },

  async createSession(input: CreateReconciliationSessionRequest): Promise<ReconciliationSession> {
    return toSession(
      await request<ReconciliationSessionDto>('/api/reconciliation-sessions', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  },

  async completeSession(id: string): Promise<ReconciliationSession> {
    return toSession(
      await request<ReconciliationSessionDto>(`/api/reconciliation-sessions/${id}/complete`, { method: 'POST' }),
    );
  },

  async createMatch(sessionId: string, input: CreateReconciliationMatchRequest): Promise<ReconciliationMatch> {
    return toMatch(
      await request<ReconciliationMatchDto>(`/api/reconciliation-sessions/${sessionId}/matches`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  },

  async confirmMatches(sessionId: string, matches: SuggestedMatch[]): Promise<ReconciliationMatch[]> {
    const body = await request<{ matches: ReconciliationMatchDto[] }>(
      `/api/reconciliation-sessions/${sessionId}/matches/confirm`,
      {
        method: 'POST',
        body: JSON.stringify({
          matches: matches.map(
            (match): CreateReconciliationMatchRequest => ({
              bankTransactionId: match.bankTransaction.id,
              bookItemType: match.bookItem.type as 'invoice' | 'payment' | 'expense',
              bookItemId: match.bookItem.id,
              matchType: match.matchType,
              confidenceScore: match.confidenceScore,
              notes: match.matchReasons.join(', '),
              status: 'confirmed',
            }),
          ),
        }),
      },
    );
    return body.matches.map(toMatch);
  },

  async listAdjustments(sessionId: string): Promise<ReconciliationAdjustment[]> {
    const body = await request<{ adjustments: ReconciliationAdjustmentDto[] }>(
      `/api/reconciliation-sessions/${sessionId}/adjustments`,
    );
    return body.adjustments.map(toAdjustment);
  },

  async createAdjustment(
    sessionId: string,
    input: CreateReconciliationAdjustmentRequest,
  ): Promise<ReconciliationAdjustment> {
    return toAdjustment(
      await request<ReconciliationAdjustmentDto>(`/api/reconciliation-sessions/${sessionId}/adjustments`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  },

  async listBookEntries(from: string, to: string): Promise<MatchableItem[]> {
    const params = new URLSearchParams({ from, to });
    const body = await request<{ entries: BookEntryDto[] }>(`/api/book-entries?${params.toString()}`);
    return body.entries.map(toBookEntry);
  },
};
