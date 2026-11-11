import React, { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { gstAdjustmentSchema, gstInputAdjustmentTypes, gstOutputAdjustmentTypes, type GstAdjustment } from '@ledgercraft/contracts';
import { ModernInput } from '@/components/ui/ModernInput';
import { ModernButton } from '@/components/ui/ModernButton';
import { useTheme, space } from '@/theme';

export function GstAdjustmentForm({ disabled, onReview, initialRows, children }: { initialRows: GstAdjustment[]; disabled: boolean; onReview: (rows: GstAdjustment[]) => Promise<void>; children?: React.ReactNode }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<GstAdjustment['kind']>('output');
  const [type, setType] = useState<NonNullable<GstAdjustment['type']>>('private_use_output');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('0.00');
  const [gross, setGross] = useState('');
  const [reason, setReason] = useState('');
  const [sourceReference, setSourceReference] = useState('');
  const [rows, setRows] = useState<GstAdjustment[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => { setRows(initialRows); setConfirmed(false); }, [initialRows]);
  const [error, setError] = useState('');
  const add = () => {
    const parsed = gstAdjustmentSchema.safeParse({ kind, type, amount, reason, sourceReference, ...(gross.trim() ? { grossAdjustment: gross.trim() } : {}), ...(type === 'other' ? { note: note.trim() } : {}) });
    if (!parsed.success) { setError(type === 'other' ? 'Other adjustments need a note, a signed two-decimal amount, a source reference and a reason of at least eight characters.' : 'Enter a signed amount with two decimals, source reference and reason of at least eight characters.'); return; }
    setRows([...rows, parsed.data]); setConfirmed(false); setAmount('0.00'); setGross(''); setReason(''); setSourceReference(''); setNote(''); setError('');
  };
  return <View style={{ gap: space.md }}>
    <ModernButton variant="secondary" disabled={disabled} onPress={() => setOpen(!open)}>{open ? 'Hide adjustments' : 'Review GST adjustments'}</ModernButton>
    {open ? <>
      <Text style={theme.type.subhead}>Record reviewed GST adjustments, including credit notes. Amounts adjust the GST only; do not add a reversal already included in the books a second time.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{(['output', 'input'] as const).map((value) => <ModernButton key={value} variant={kind === value ? 'primary' : 'secondary'} disabled={disabled} onPress={() => { setKind(value); setType(value === 'output' ? 'private_use_output' : 'bad_debt_written_off'); }}>{value === 'output' ? 'Sales GST' : 'Purchase GST'}</ModernButton>)}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{(kind === 'output' ? gstOutputAdjustmentTypes : gstInputAdjustmentTypes).map((value) => <ModernButton key={value} variant={type === value ? 'primary' : 'secondary'} disabled={disabled} onPress={() => setType(value)}>{value.split('_').join(' ')}</ModernButton>)}</View>
      <ModernInput editable={!disabled} label="Signed GST adjustment" value={amount} onChangeText={setAmount} />
      <Text style={theme.type.caption}>For an external credit, include its signed gross change as well as GST. Leave gross blank for a GST-only correction.</Text>
      <ModernInput editable={!disabled} label="Gross adjustment (optional)" value={gross} onChangeText={setGross} />
      <ModernInput editable={!disabled} label="Adjustment source reference" value={sourceReference} onChangeText={setSourceReference} />
      <ModernInput editable={!disabled} label="Adjustment reason" value={reason} onChangeText={setReason} multiline />
      {type === 'other' ? <ModernInput editable={!disabled} label="Adjustment note" value={note} onChangeText={setNote} multiline /> : null}
      <ModernButton variant="secondary" disabled={disabled} onPress={add}>Add adjustment</ModernButton>
      {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text> : null}
      {rows.map((row, index) => <View key={index}><Text style={theme.type.body}>{row.kind}: {row.amount}{row.grossAdjustment ? ` · gross ${row.grossAdjustment}` : ''} · {row.sourceReference}</Text><Text style={theme.type.caption}>{row.reason}</Text><ModernButton variant="ghost" onPress={() => { setRows(rows.filter((_, position) => position !== index)); setConfirmed(false); }}>Remove adjustment {index + 1}</ModernButton></View>)}
      {children}
      <Text style={theme.type.body}>I have reviewed the source books and adjustments</Text>
      <Switch disabled={disabled} accessibilityLabel="Confirm GST adjustment review" value={confirmed} onValueChange={setConfirmed} />
      <ModernButton disabled={disabled || !confirmed} onPress={() => void onReview(rows)}>Apply reviewed GST adjustments</ModernButton>
    </> : null}
  </View>;
}
