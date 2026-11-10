import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AssistantProposal } from '@ledgercraft/contracts';
import { ModernInput, PillButton } from '@/components/ui';
import type { ProposalDraft } from '@/features/assistant/model/proposalDraft';
import {
  draftHasEdits,
  draftReadyToSave,
  dueDateFormatError,
  issueDateFormatError,
  screenMatchesPricedPreview,
  taxRateFormatError,
} from '@/features/assistant/model/proposalDraft';
import { useProposalPreview, type ProposalPreviewState } from '@/features/assistant/model/useProposalPreview';
import { useTheme } from '@/theme';

type ProposalCardProps = Readonly<{
  proposal: AssistantProposal;
  draft: ProposalDraft;
  conversationId?: string;
  saving: boolean;
  onChange: (draft: ProposalDraft) => void;
  onSave: () => void;
}>;

function fieldMessage(preview: ProposalPreviewState, field: string) {
  if (preview.status !== 'ready') return undefined;
  return preview.preview.errors.find((error) => error.field === field)?.message;
}

function moneyText(amount: string, currency: string) {
  return `${amount} ${currency}`;
}

export function ProposalCard({ proposal, draft, conversationId, saving, onChange, onSave }: ProposalCardProps) {
  const theme = useTheme();
  const dirty = draftHasEdits(proposal, draft);
  const ready = draftReadyToSave(draft);
  const preview = useProposalPreview(conversationId, proposal, draft);
  const priced = pricedTotals(preview, proposal, draft, dirty);
  const unconfirmed = dirty || preview.status === 'pending' || preview.status === 'error';
  const issueError = issueDateFormatError(proposal.date, draft.issueDate) ?? fieldMessage(preview, 'date') ?? fieldMessage(preview, 'issueDate');
  const dueError = dueDateFormatError(proposal.dueDate, draft.dueDate) ?? fieldMessage(preview, 'dueDate');
  const rateError = taxRateFormatError(proposal.taxRate, draft.taxRate) ?? fieldMessage(preview, 'taxRate');
  const updateLine = (index: number, patch: Partial<ProposalDraft['lines'][number]>) => {
    onChange({
      ...draft,
      lines: draft.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    });
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={theme.type.headline}>Invoice draft</Text>
      <Text style={theme.type.footnote}>Nothing is saved until you tap Save draft.</Text>
      <Text style={theme.type.footnote}>Customer</Text>
      <Text style={theme.type.body} accessibilityLabel={draft.customerName ? `Customer ${draft.customerName}` : 'Customer needed'}>
        {draft.customerName ?? 'Customer needed'}
      </Text>
      {fieldMessage(preview, 'customerId') ? <Text style={[theme.type.footnote, { color: theme.colors.danger }]}>{fieldMessage(preview, 'customerId')}</Text> : null}
      <ModernInput
        label="Issue date"
        value={draft.issueDate}
        onChangeText={(issueDate) => onChange({ ...draft, issueDate })}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
        error={issueError}
        accessibilityHint={issueError ?? 'Calendar day the server uses as the invoice date'}
      />
      <ModernInput
        label="Due date"
        value={draft.dueDate}
        onChangeText={(dueDate) => onChange({ ...draft, dueDate })}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
        error={dueError}
        accessibilityHint={dueError ?? 'Calendar day from the server, or a day you type'}
      />
      <View style={styles.gst}>
        <PillButton
          label="Prices include GST"
          variant={draft.taxInclusive === true ? 'primary' : 'secondary'}
          onPress={() => onChange({ ...draft, taxInclusive: true })}
        />
        <PillButton
          label="Prices exclude GST"
          variant={draft.taxInclusive === false ? 'primary' : 'secondary'}
          onPress={() => onChange({ ...draft, taxInclusive: false })}
        />
      </View>
      <ModernInput
        label="GST rate"
        value={draft.taxRate}
        onChangeText={(taxRate) => onChange({ ...draft, taxRate })}
        keyboardType="decimal-pad"
        error={rateError}
        accessibilityHint={rateError ?? 'GST percent from 0 to 100. The server applies this rate.'}
      />
      {fieldMessage(preview, 'taxInclusive') ? <Text style={[theme.type.footnote, { color: theme.colors.danger }]}>{fieldMessage(preview, 'taxInclusive')}</Text> : null}
      {draft.lines.map((line, index) => {
        const lineName = line.description || `line ${index + 1}`;
        const serverLine = preview.status === 'ready' ? preview.preview.lines[index] : undefined;
        return (
          <View key={`${line.description}-${index}`} style={styles.line}>
            <ModernInput
              label={`Description ${index + 1}`}
              value={line.description}
              onChangeText={(description) => updateLine(index, { description })}
              error={fieldMessage(preview, `lines.${index}.description`)}
            />
            <ModernInput
              label={`Quantity for ${lineName}`}
              value={line.quantity}
              onChangeText={(quantity) => updateLine(index, { quantity })}
              keyboardType="decimal-pad"
              error={fieldMessage(preview, `lines.${index}.quantity`)}
            />
            <ModernInput
              label={`Rate for ${lineName}`}
              value={line.rate}
              onChangeText={(rate) => updateLine(index, { rate })}
              keyboardType="decimal-pad"
              placeholder="Rate"
              error={fieldMessage(preview, `lines.${index}.rate`)}
            />
            {fieldMessage(preview, `lines.${index}.itemId`) ? <Text style={[theme.type.footnote, { color: theme.colors.danger }]}>{fieldMessage(preview, `lines.${index}.itemId`)}</Text> : null}
            {priced && serverLine?.total ? <Text style={theme.type.subhead}>Line total {moneyText(serverLine.total, proposal.currency)}</Text> : null}
          </View>
        );
      })}
      <ModernInput
        label="Notes"
        value={draft.notes}
        onChangeText={(notes) => onChange({ ...draft, notes })}
      />
      {priced ? (
        <View accessibilityLabel={`Total ${moneyText(priced.total, proposal.currency)}`}>
          <Text style={theme.type.subhead}>Subtotal {moneyText(priced.subtotal, proposal.currency)}</Text>
          <Text style={theme.type.subhead}>GST {moneyText(priced.taxAmount, proposal.currency)}</Text>
          <Text style={[theme.type.headline, styles.total]}>{moneyText(priced.total, proposal.currency)}</Text>
        </View>
      ) : (
        <View>
          <Text style={[theme.type.headline, { color: theme.colors.warning }]}>{unconfirmed ? 'Unconfirmed' : 'Incomplete'}</Text>
          {preview.status === 'error' ? <Text accessibilityRole="alert" style={[theme.type.subhead, { color: theme.colors.danger }]}>{preview.message}</Text> : (
            <Text style={theme.type.subhead}>
              {preview.status === 'pending'
                ? 'Checking this edit with the server. Totals stay unconfirmed.'
                : dirty
                  ? 'Totals stay unconfirmed.'
                  : 'The server has not priced this invoice yet.'}
            </Text>
          )}
        </View>
      )}
      <PillButton label="Save draft" disabled={!ready || saving} loading={saving} onPress={onSave} />
    </View>
  );
}

function pricedTotals(
  preview: ProposalPreviewState,
  proposal: AssistantProposal,
  draft: ProposalDraft,
  dirty: boolean,
): { subtotal: string; taxAmount: string; total: string } | null {
  if (preview.status === 'ready') {
    const body = preview.preview;
    const matches = body.date != null && body.taxRate != null && screenMatchesPricedPreview(proposal, draft, {
      date: body.date,
      dueDate: body.dueDate ?? null,
      taxRate: body.taxRate,
    });
    if (matches && body.subtotal != null && body.taxAmount != null && body.total != null) {
      return { subtotal: body.subtotal, taxAmount: body.taxAmount, total: body.total };
    }
    return null;
  }
  if (preview.status === 'idle' && !dirty && proposal.totals) return proposal.totals;
  return null;
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 16, gap: 12 },
  gst: { gap: 8 },
  line: { gap: 8 },
  total: { fontVariant: ['tabular-nums'] },
});
