import {
  bankTransactionSuggestionResponseSchema,
  type BankTransactionDto,
  type BankTransactionSuggestionResponse,
} from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { decimal } from '../invoices/money';
import * as rulesRepo from './matching-rules.repository';
import { scoreSuggestion } from './suggestion-scoring';
import * as suggestionRepo from './suggestions.repository';

export async function suggestionsForTransactionInTx(
  tx: Database,
  organisationId: string,
  transaction: BankTransactionDto,
): Promise<BankTransactionSuggestionResponse> {
  if (transaction.isReconciled || transaction.source === 'transfer') {
    return { transactionId: transaction.id, suggestions: [] };
  }
  const candidates = await suggestionRepo.listCandidates(tx, organisationId, transaction.type);
  const documentSuggestions = candidates.flatMap((candidate) => {
    const scored = scoreSuggestion({
      transactionAmount: transaction.amount,
      transactionDate: transaction.transactionDate,
      transactionReference: transaction.reference,
      transactionDescription: transaction.description,
      candidateAmount: candidate.amount,
      candidateDate: candidate.date,
      candidateReference: candidate.reference,
      candidateDescription: candidate.description,
      candidateCounterparty: candidate.counterparty,
    });
    return scored ? [{
      ...candidate,
      score: scored.score,
      reasons: scored.reasons,
      matchingRuleId: null,
      targetAccountId: null,
      contactId: null,
    }] : [];
  });
  const rules = await rulesRepo.listRules(tx, organisationId, true);
  const normalisedDescription = transaction.description.toLowerCase();
  const ruleSuggestions = rules.filter((rule) => {
    if (rule.direction !== 'any' && rule.direction !== transaction.type) return false;
    if (!normalisedDescription.includes(rule.descriptionContains.toLowerCase())) return false;
    if (rule.amountMin != null && decimal(transaction.amount).compare(rule.amountMin) < 0) return false;
    if (rule.amountMax != null && decimal(transaction.amount).compare(rule.amountMax) > 0) return false;
    return true;
  }).map((rule) => ({
    id: rule.id,
    type: 'matching_rule' as const,
    date: transaction.transactionDate,
    description: `Rule: ${rule.descriptionContains}`,
    reference: transaction.reference,
    counterparty: transaction.counterparty,
    amount: transaction.amount,
    score: 90,
    reasons: [`Description contains ${rule.descriptionContains}`],
    matchingRuleId: rule.id,
    targetAccountId: rule.targetAccountId,
    contactId: rule.contactId,
  }));
  return bankTransactionSuggestionResponseSchema.parse({
    transactionId: transaction.id,
    suggestions: [...documentSuggestions, ...ruleSuggestions].sort((left, right) => right.score - left.score || left.description.localeCompare(right.description)),
  });
}
