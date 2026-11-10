import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AssistantProposal } from '@ledgercraft/contracts';
import { ModernInput, PillButton } from '@/components/ui';
import type { ProposalDraft } from '@/features/assistant/model/proposalDraft';
import { draftHasEdits, draftReadyToSave } from '@/features/assistant/model/proposalDraft';
import { useTheme } from '@/theme';
import { formatMoney } from '@/utils/money';

type ProposalCardProps = Readonly<{
  proposal: AssistantProposal;
  draft: ProposalDraft;
  saving: boolean;
  onChange: (draft: ProposalDraft) => void;
  onSave: () => void;
}>;

export function ProposalCard({ proposal, draft, saving, onChange, onSave }: ProposalCardProps) {
  const theme = useTheme();
  const dirty = draftHasEdits(proposal, draft);
  const ready = draftReadyToSave(draft);
  const priced = proposal.totals !== null && !dirty;
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
      <Text style={theme.type.subhead}>Invoice date {proposal.date}</Text>
      <ModernInput
        label="Due date"
        value={draft.dueDate}
        onChangeText={(dueDate) => onChange({ ...draft, dueDate })}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
        accessibilityHint="Calendar day from the server, or a day you type"
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
      <Text style={theme.type.footnote}>GST rate {proposal.taxRate} from the server</Text>
      {draft.lines.map((line, index) => {
        const lineName = line.description || `line ${index + 1}`;
        return (
          <View key={`${line.description}-${index}`} style={styles.line}>
            <ModernInput
              label={`Description ${index + 1}`}
              value={line.description}
              onChangeText={(description) => updateLine(index, { description })}
            />
            <ModernInput
              label={`Quantity for ${lineName}`}
              value={line.quantity}
              onChangeText={(quantity) => updateLine(index, { quantity })}
              keyboardType="decimal-pad"
            />
            <ModernInput
              label={`Rate for ${lineName}`}
              value={line.rate}
              onChangeText={(rate) => updateLine(index, { rate })}
              keyboardType="decimal-pad"
              placeholder="Rate"
            />
          </View>
        );
      })}
      <ModernInput
        label="Notes"
        value={draft.notes}
        onChangeText={(notes) => onChange({ ...draft, notes })}
      />
      {priced && proposal.totals ? (
        <View accessibilityLabel={`Total ${formatMoney(proposal.totals.total, proposal.currency)}`}>
          <Text style={theme.type.subhead}>Subtotal {formatMoney(proposal.totals.subtotal, proposal.currency)}</Text>
          <Text style={theme.type.subhead}>GST {formatMoney(proposal.totals.taxAmount, proposal.currency)}</Text>
          <Text style={[theme.type.headline, styles.total]}>{formatMoney(proposal.totals.total, proposal.currency)}</Text>
        </View>
      ) : (
        <View>
          <Text style={[theme.type.headline, { color: theme.colors.warning }]}>Incomplete</Text>
          <Text style={theme.type.subhead}>
            {dirty
              ? 'The server prices these edits when you save the draft.'
              : 'The server has not priced this invoice yet.'}
          </Text>
          {dirty && proposal.totals ? (
            <Text style={theme.type.footnote} accessibilityLabel={`Last server total ${formatMoney(proposal.totals.total, proposal.currency)}`}>
              Last server total {formatMoney(proposal.totals.total, proposal.currency)}
            </Text>
          ) : null}
        </View>
      )}
      <PillButton label="Save draft" disabled={!ready || saving} loading={saving} onPress={onSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 16, gap: 12 },
  gst: { gap: 8 },
  line: { gap: 8 },
  total: { fontVariant: ['tabular-nums'] },
});
