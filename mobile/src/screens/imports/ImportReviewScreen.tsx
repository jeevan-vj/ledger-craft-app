import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { InvoiceImportConfidence, InvoiceImportDraftPatch, InvoiceImportDraftResponse, InvoiceImportExtractedLine } from '@ledgercraft/contracts';
import { AppPressable, EmptyState, ModernButton } from '@/components/ui';
import { SelectionRow, SelectionSheet } from '@/components/ui/SelectionSheet';
import { canImportInvoices } from '@/features/auth/invoiceAccess';
import { businessProfileApi } from '@/features/business-profile/api/businessProfileApi';
import { customersApi } from '@/features/customers/api/customersApi';
import { documentImportApi } from '@/features/invoice-import/api/documentImportApi';
import { commitDecision } from '@/features/invoice-import/model/reviewDecision';
import { purchasesApi } from '@/features/purchases/api/purchasesApi';
import type { RootStackParamList } from '@/navigation/types';
import { useStore } from '@/store';
import { useTheme } from '@/theme';
import { control, hairline, radius, space } from '@/theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'ImportReview'>;
export default function ImportReviewScreen({ navigation, route }: Props) {
  const theme = useTheme(); const styles = createStyles(theme); const queryClient = useQueryClient();
  const allowed = useStore((state) => canImportInvoices(state.permissions));
  const [review, setReview] = useState<InvoiceImportDraftResponse | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false); const [contactOpen, setContactOpen] = useState(false); const [contactSearch, setContactSearch] = useState('');
  const [acknowledged, setAcknowledged] = useState(false); const [saving, setSaving] = useState(false); const [committing, setCommitting] = useState(false); const [error, setError] = useState<string | null>(null);
  const draftQuery = useQuery({ queryKey: ['invoice-import', route.params.importId], queryFn: () => documentImportApi.getDraft(route.params.importId), enabled: allowed });
  const customers = useQuery({ queryKey: ['customers'], queryFn: customersApi.list, enabled: allowed });
  const vendors = useQuery({ queryKey: ['purchases', 'vendors'], queryFn: purchasesApi.listVendors, enabled: allowed });
  const profile = useQuery({ queryKey: ['business-profile'], queryFn: businessProfileApi.get, enabled: allowed });
  useEffect(() => { if (draftQuery.data) setReview(draftQuery.data); }, [draftQuery.data]);

  const patch = async (input: InvoiceImportDraftPatch) => {
    if (!review) return;
    setSaving(true); setError(null);
    try { setReview(await documentImportApi.patchDraft(review.documentId, input)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The review could not be saved.'); }
    finally { setSaving(false); }
  };

  const contacts = useMemo(() => {
    if (!review?.direction) return [];
    const rows = review.direction === 'SALES'
      ? (customers.data ?? []).map((row) => ({ id: row.id, name: row.name, detail: row.email || 'Customer' }))
      : (vendors.data ?? []).map((row) => ({ id: row.id, name: row.name, detail: row.email ?? 'Vendor' }));
    const needle = contactSearch.trim().toLowerCase();
    return rows.filter((row) => !needle || row.name.toLowerCase().includes(needle));
  }, [contactSearch, customers.data, review?.direction, vendors.data]);
  const selectedContact = contacts.find((item) => item.id === review?.contactId)
    ?? [...(customers.data ?? []), ...(vendors.data ?? [])].find((item) => item.id === review?.contactId);

  if (!allowed) return <View style={styles.state}><EmptyState title="Import access restricted" description="You don't have permission to import invoices. Ask an owner or administrator for invoice import access." actionLabel="Go back" onAction={() => navigation.goBack()} /></View>;
  if (!review && draftQuery.isPending) return <View style={styles.state}><ActivityIndicator size="large" color={theme.colors.accent} accessibilityLabel="Loading import review" /><Text style={styles.stateText}>Loading extracted fields</Text></View>;
  if (!review) return <View style={styles.state}><EmptyState title="Couldn't open this import" description={draftQuery.error instanceof Error ? draftQuery.error.message : 'The extracted draft is unavailable.'} actionLabel="Try again" onAction={() => void draftQuery.refetch()} /></View>;

  const decision = commitDecision(review, acknowledged);
  const chooseDirection = (direction: 'SALES' | 'PURCHASE') => { setAcknowledged(false); void patch({ direction, contactId: null }); };
  const commit = async () => {
    if (!decision.canCommit) return;
    setCommitting(true); setError(null);
    try {
      const result = await documentImportApi.commit(review.documentId, acknowledged);
      await queryClient.invalidateQueries({ queryKey: result.recordType === 'invoice' ? ['invoices'] : ['purchases', 'bills'] });
      if (result.recordType === 'invoice') navigation.navigate('Main', { screen: 'Invoices', params: { screen: 'InvoiceDetail', params: { invoiceId: result.recordId } } });
      else navigation.navigate('Main', { screen: 'More', params: { screen: 'BillDetail', params: { billId: result.recordId } } });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The draft could not be created.'); setCommitting(false); }
  };

  return <View style={styles.canvas}><ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <AppPressable accessibilityRole="button" accessibilityLabel={`View original ${route.params.filename}`} accessibilityHint="Enlarges the original document preview" onPress={() => setPreviewOpen(true)} style={({ pressed }) => [styles.preview, pressed && styles.pressed]}>
      {route.params.mimeType.startsWith('image/') ? <Image source={{ uri: route.params.localUri }} style={styles.previewImage} accessibilityLabel={`Original document ${route.params.filename}`} /> : <View style={styles.pdfCard}><View style={styles.pdfIcon}><Feather name="file-text" size={28} color={theme.colors.accentText} /></View><View style={styles.previewCopy}><Text style={styles.previewTitle} numberOfLines={1}>{route.params.filename}</Text><Text style={styles.previewMeta}>Original PDF · tap to enlarge</Text></View></View>}
      {route.params.mimeType.startsWith('image/') ? <View style={styles.previewOverlay}><Feather name="maximize-2" size={17} color={theme.colors.text} /><Text style={styles.previewOverlayText}>View original</Text></View> : null}
    </AppPressable>

    <View style={styles.headingRow}><View><Text style={styles.title}>Review extraction</Text><Text style={styles.subtitle}>Check every field before creating a draft.</Text></View>{review.mock ? <Text style={styles.mockBadge}>DEMO MOCK</Text> : null}</View>

    <Text style={styles.sectionTitle}>Required direction</Text><Text style={styles.sectionHelp}>AI suggestion only: {review.draft.suggestedDirection ? `${review.draft.suggestedDirection === 'SALES' ? 'Sales' : 'Purchase'} — ${review.draft.suggestedDirectionReason}` : 'No suggestion'}</Text>
    <View style={styles.directionGrid}>
      <DirectionChoice selected={review.direction === 'SALES'} title="Sales income" detail="A customer owes your business" icon="arrow-down-left" onPress={() => chooseDirection('SALES')} />
      <DirectionChoice selected={review.direction === 'PURCHASE'} title="Purchase / expense" detail="Your business owes a supplier" icon="arrow-up-right" onPress={() => chooseDirection('PURCHASE')} />
    </View>

    {review.direction === 'SALES' ? <View style={styles.switchRow}><View style={styles.switchCopy}><Text style={styles.switchTitle}>Issued by a third party</Text><Text style={styles.switchDetail}>Buyer-created or self-billed document</Text></View><Switch value={review.thirdPartyIssued} onValueChange={(value) => void patch({ thirdPartyIssued: value })} trackColor={{ false: theme.colors.fill, true: theme.colors.accent }} thumbColor={review.thirdPartyIssued ? theme.colors.accentForeground : theme.colors.surface} accessibilityLabel="Issued by a third party" /></View> : null}
    {review.direction === 'SALES' && review.thirdPartyIssued ? <View style={styles.warning} accessibilityRole="alert"><Text style={styles.warningTitle}>Confirm the third-party treatment</Text><Text style={styles.warningText}><Text style={styles.bold}>{review.draft.issuerName ?? 'The third party'}</Text> issued this buyer-created document. It will be recorded as sales income for <Text style={styles.bold}>{profile.data?.name ?? 'your business'}</Text>. Keep the external number and confirm the treatment with your accountant or IRD.</Text></View> : null}

    <Text style={styles.sectionTitle}>Counterparty</Text><AppPressable accessibilityRole="button" accessibilityLabel={`Choose ${review.direction === 'SALES' ? 'customer' : 'vendor'}`} accessibilityState={{ disabled: !review.direction }} disabled={!review.direction} onPress={() => setContactOpen(true)} style={({ pressed }) => [styles.selector, pressed && styles.pressed, !review.direction && styles.disabled]}><View><Text style={styles.selectorLabel}>{selectedContact?.name ?? (review.direction ? `Choose ${review.direction === 'SALES' ? 'customer' : 'vendor'}` : 'Choose a direction first')}</Text>{selectedContact && 'email' in selectedContact && selectedContact.email ? <Text style={styles.selectorDetail}>{selectedContact.email}</Text> : null}</View><Feather name="chevron-right" size={20} color={theme.colors.textTertiary} /></AppPressable>

    <Text style={styles.sectionTitle}>Document fields</Text>
    <ReviewField label="Issuer" value={review.draft.issuerName ?? ''} confidence={review.draft.confidence.issuerName} onSave={(value) => patch({ issuerName: value || null })} />
    <ReviewField label="Recipient" value={review.draft.recipientName ?? ''} confidence={review.draft.confidence.recipientName} onSave={(value) => patch({ recipientName: value || null })} />
    <ReviewField label="Document number" value={review.draft.documentNumber ?? ''} confidence={review.draft.confidence.documentNumber} onSave={(value) => patch({ documentNumber: value || null })} />
    <View style={styles.twoColumns}><ReviewField compact label="Issue date" value={review.draft.issueDate ?? ''} confidence={review.draft.confidence.issueDate} onSave={(value) => patch({ issueDate: value || null })} /><ReviewField compact label="Due date" value={review.draft.dueDate ?? ''} confidence={review.draft.confidence.dueDate} onSave={(value) => patch({ dueDate: value || null })} /></View>

    <Text style={styles.sectionTitle}>Line items</Text>{review.draft.lineItems.map((line, index) => <LineEditor key={index} index={index} line={line} confidence={review.draft.confidence.lineItems[index]} onSave={(updated) => patch({ lineItems: review.draft.lineItems.map((item, itemIndex) => itemIndex === index ? updated : item) })} />)}
    <View style={styles.threeColumns}><ReviewField compact label="Net" value={review.draft.net} confidence={review.draft.confidence.net} keyboardType="decimal-pad" onSave={(value) => patch({ net: value })} /><ReviewField compact label="GST" value={review.draft.gst} confidence={review.draft.confidence.gst} keyboardType="decimal-pad" onSave={(value) => patch({ gst: value })} /><ReviewField compact label="Total" value={review.draft.total} confidence={review.draft.confidence.total} keyboardType="decimal-pad" onSave={(value) => patch({ total: value })} /></View>

    {review.validationIssues.some((issue) => issue.blocking) ? <View style={styles.block} accessibilityRole="alert"><Text style={styles.blockTitle}>Totals mismatch — draft blocked</Text>{review.validationIssues.filter((issue) => issue.blocking).map((issue) => <Text key={`${issue.code}-${issue.path}`} style={styles.blockText}>{issue.message}</Text>)}</View> : null}
    {review.duplicateWarnings.length ? <View style={styles.warning} accessibilityRole="alert"><Text style={styles.warningTitle}>Possible duplicate</Text>{review.duplicateWarnings.map((warning) => <Text key={`${warning.kind}-${warning.recordId}`} style={styles.warningText}>• {warning.message}</Text>)}<AppPressable accessibilityRole="checkbox" accessibilityLabel="I reviewed the possible duplicate" accessibilityState={{ checked: acknowledged }} onPress={() => setAcknowledged((value) => !value)} style={({ pressed }) => [styles.checkRow, pressed && styles.pressed]}><View style={[styles.checkbox, acknowledged && styles.checkboxChecked]}>{acknowledged ? <Feather name="check" size={16} color={theme.colors.accentForeground} /> : null}</View><Text style={styles.checkText}>I reviewed the possible duplicate and want to continue.</Text></AppPressable></View> : null}
    {error ? <View style={styles.block} accessibilityRole="alert"><Text style={styles.blockText}>{error}</Text></View> : null}
    {!decision.canCommit ? <Text style={styles.blockingSummary}>{decision.reasons[0]}</Text> : null}
    <ModernButton fullWidth size="lg" loading={committing} disabled={!decision.canCommit || saving} onPress={() => void commit()}>{review.direction === 'PURCHASE' ? 'Create draft bill' : review.direction === 'SALES' ? 'Create draft invoice' : 'Choose Sales or Purchase'}</ModernButton>
    <Text style={styles.safety}>Creates a draft only. Nothing is sent, paid, posted or journalled.</Text>
  </ScrollView>

  <SelectionSheet visible={contactOpen} title={review.direction === 'SALES' ? 'Choose customer' : 'Choose vendor'} searchPlaceholder="Search contacts" searchQuery={contactSearch} onSearchChange={setContactSearch} onClose={() => setContactOpen(false)} loading={customers.isLoading || vendors.isLoading} empty={!contacts.length} emptyTitle="No matching contacts" emptyDescription="Add the contact before committing this import.">{contacts.map((contact) => <SelectionRow key={contact.id} title={contact.name} subtitle={contact.detail} selected={contact.id === review.contactId} onPress={() => { setContactOpen(false); void patch({ contactId: contact.id }); }} />)}</SelectionSheet>
  <Modal visible={previewOpen} animationType="fade" onRequestClose={() => setPreviewOpen(false)}><View style={styles.modal}><AppPressable accessibilityRole="button" accessibilityLabel="Close original preview" onPress={() => setPreviewOpen(false)} style={styles.close}><Feather name="x" size={24} color={theme.colors.text} /></AppPressable>{route.params.mimeType.startsWith('image/') ? <Image source={{ uri: route.params.localUri }} style={styles.fullImage} resizeMode="contain" accessibilityLabel={`Original document ${route.params.filename}`} /> : <View style={styles.enlargedPdf}><Feather name="file-text" size={58} color={theme.colors.accentText} /><Text style={styles.previewTitle}>{route.params.filename}</Text><Text style={styles.previewMeta}>PDF original selected for this import</Text></View>}</View></Modal>
  </View>;
}

function DirectionChoice({ selected, title, detail, icon, onPress }: { selected: boolean; title: string; detail: string; icon: 'arrow-down-left' | 'arrow-up-right'; onPress: () => void }) { const theme = useTheme(); const styles = createStyles(theme); return <AppPressable accessibilityRole="radio" accessibilityLabel={title} accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.direction, selected && styles.directionSelected, pressed && styles.pressed]}><View style={[styles.directionIcon, selected && styles.directionIconSelected]}><Feather name={icon} size={20} color={selected ? theme.colors.accentForeground : theme.colors.accentText} /></View><Text style={styles.directionTitle}>{title}</Text><Text style={styles.directionDetail}>{detail}</Text></AppPressable>; }

function ReviewField({ label, value, confidence, onSave, compact = false, keyboardType = 'default' }: { label: string; value: string; confidence: InvoiceImportConfidence; onSave: (value: string) => void | Promise<void>; compact?: boolean; keyboardType?: 'default' | 'decimal-pad' }) { const theme = useTheme(); const styles = createStyles(theme); const [draft, setDraft] = useState(value); useEffect(() => setDraft(value), [value]); const flagged = confidence.label !== 'High'; return <View style={[styles.field, compact && styles.compactField, flagged && styles.flagged]} accessible accessibilityLabel={`${label}. Confidence ${confidence.label}, ${Math.round(confidence.value * 100)} percent`}><View style={styles.fieldLabelRow}><Text style={styles.fieldLabel}>{label}</Text>{flagged ? <Text style={styles.confidence}>{confidence.label} · {Math.round(confidence.value * 100)}%</Text> : null}</View><TextInput value={draft} onChangeText={setDraft} onBlur={() => { if (draft !== value) void onSave(draft); }} keyboardType={keyboardType} style={styles.input} accessibilityLabel={label} /></View>; }

function LineEditor({ index, line, confidence, onSave }: { index: number; line: InvoiceImportExtractedLine; confidence?: InvoiceImportConfidence; onSave: (line: InvoiceImportExtractedLine) => void | Promise<void> }) { const theme = useTheme(); const styles = createStyles(theme); const [draft, setDraft] = useState(line); useEffect(() => setDraft(line), [line]); const update = (field: keyof InvoiceImportExtractedLine, value: string) => setDraft((current) => ({ ...current, [field]: value })); const save = () => { if (JSON.stringify(draft) !== JSON.stringify(line)) void onSave(draft); }; const flagged = confidence?.label !== 'High'; return <View style={[styles.line, flagged && styles.flagged]} accessible accessibilityLabel={`Line ${index + 1}. Confidence ${confidence?.label ?? 'Missing'}, ${Math.round((confidence?.value ?? 0) * 100)} percent`}><View style={styles.fieldLabelRow}><Text style={styles.lineTitle}>Line {index + 1}</Text>{flagged ? <Text style={styles.confidence}>{confidence?.label ?? 'Missing'} · {Math.round((confidence?.value ?? 0) * 100)}%</Text> : null}</View><TextInput value={draft.description} onChangeText={(value) => update('description', value)} onBlur={save} style={styles.input} accessibilityLabel={`Line ${index + 1} description`} /><View style={styles.threeColumns}><MiniInput label="Qty" value={draft.quantity} onChange={(value) => update('quantity', value)} onBlur={save} /><MiniInput label="Price" value={draft.unitPrice} onChange={(value) => update('unitPrice', value)} onBlur={save} /><MiniInput label="GST %" value={draft.gstRate} onChange={(value) => update('gstRate', value)} onBlur={save} /></View><MiniInput label="Line amount" value={draft.amount} onChange={(value) => update('amount', value)} onBlur={save} /></View>; }
function MiniInput({ label, value, onChange, onBlur }: { label: string; value: string; onChange: (value: string) => void; onBlur: () => void }) { const theme = useTheme(); const styles = createStyles(theme); return <View style={styles.mini}><Text style={styles.miniLabel}>{label}</Text><TextInput value={value} onChangeText={onChange} onBlur={onBlur} keyboardType="decimal-pad" style={styles.miniInput} accessibilityLabel={label} /></View>; }

const createStyles = ({ colors, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors.background }, content: { padding: space.screen, paddingBottom: 64 }, state: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: space.screen }, stateText: { ...type.subhead, marginTop: space.md },
  preview: { minHeight: 112, borderRadius: radius.group, backgroundColor: colors.surface, overflow: 'hidden' }, previewImage: { width: '100%', height: 190, resizeMode: 'cover' }, pdfCard: { minHeight: 112, flexDirection: 'row', alignItems: 'center', padding: space.lg, gap: space.md }, pdfIcon: { width: 54, height: 68, borderRadius: radius.sm, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' }, previewCopy: { flex: 1 }, previewTitle: { ...type.headline, textAlign: 'center' }, previewMeta: { ...type.footnote, marginTop: 3, textAlign: 'center' }, previewOverlay: { position: 'absolute', right: space.md, bottom: space.md, flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: control.touchTarget, borderRadius: radius.pill, paddingHorizontal: space.md, backgroundColor: colors.scrim }, previewOverlayText: { ...type.caption, color: colors.text },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md, marginTop: space.xxl }, title: { ...type.title }, subtitle: { ...type.footnote, marginTop: 3 }, mockBadge: { ...type.caption, color: colors.accentForeground, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: space.xs, overflow: 'hidden' },
  sectionTitle: { ...type.section, marginTop: space.xxl, marginBottom: space.xs }, sectionHelp: { ...type.footnote, marginBottom: space.md }, directionGrid: { flexDirection: 'row', gap: space.md }, direction: { flex: 1, minHeight: 132, backgroundColor: colors.surface, borderRadius: radius.group, borderWidth: 1, borderColor: colors.border, padding: space.md }, directionSelected: { borderColor: colors.accent, backgroundColor: colors.accentFill }, directionIcon: { width: control.touchTarget, height: control.touchTarget, borderRadius: radius.pill, backgroundColor: colors.fillMuted, alignItems: 'center', justifyContent: 'center' }, directionIconSelected: { backgroundColor: colors.accent }, directionTitle: { ...type.callout, marginTop: space.sm }, directionDetail: { ...type.caption, marginTop: space.xs }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.45 },
  switchRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', marginTop: space.lg, padding: space.lg, borderRadius: radius.group, backgroundColor: colors.surface }, switchCopy: { flex: 1, paddingRight: space.md }, switchTitle: { ...type.callout }, switchDetail: { ...type.footnote, marginTop: 2 }, warning: { marginTop: space.md, padding: space.lg, borderRadius: radius.group, backgroundColor: colors.warningFill, borderWidth: hairline, borderColor: colors.warning }, warningTitle: { ...type.headline, color: colors.warning }, warningText: { ...type.footnote, color: colors.text, marginTop: space.sm, lineHeight: 19 }, bold: { fontWeight: '700' },
  selector: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.group, paddingHorizontal: space.lg }, selectorLabel: { ...type.callout }, selectorDetail: { ...type.footnote, marginTop: 2 },
  field: { marginBottom: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'transparent' }, compactField: { flex: 1 }, flagged: { borderColor: colors.warning, backgroundColor: colors.warningFill }, fieldLabelRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }, fieldLabel: { ...type.caption }, confidence: { ...type.caption, color: colors.warning }, input: { ...type.body, minHeight: control.touchTarget, paddingVertical: space.sm, color: colors.text }, twoColumns: { flexDirection: 'row', gap: space.md }, threeColumns: { flexDirection: 'row', gap: space.sm },
  line: { marginBottom: space.md, padding: space.md, borderRadius: radius.group, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'transparent' }, lineTitle: { ...type.callout }, mini: { flex: 1, minWidth: 0, marginTop: space.sm }, miniLabel: { ...type.caption }, miniInput: { ...type.callout, minHeight: control.touchTarget, color: colors.text, borderBottomWidth: hairline, borderBottomColor: colors.separator },
  block: { marginVertical: space.md, padding: space.lg, borderRadius: radius.group, backgroundColor: colors.dangerFill, borderWidth: hairline, borderColor: colors.danger }, blockTitle: { ...type.headline, color: colors.danger }, blockText: { ...type.footnote, color: colors.danger, marginTop: space.xs }, checkRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md }, checkbox: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: colors.warning, alignItems: 'center', justifyContent: 'center' }, checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent }, checkText: { ...type.footnote, flex: 1, color: colors.text }, blockingSummary: { ...type.footnote, color: colors.danger, textAlign: 'center', marginBottom: space.sm }, safety: { ...type.footnote, textAlign: 'center', marginTop: space.sm },
  modal: { flex: 1, backgroundColor: colors.background, padding: space.screen, justifyContent: 'center' }, close: { position: 'absolute', top: 52, right: space.screen, width: control.default, height: control.default, borderRadius: radius.pill, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center', zIndex: 2 }, fullImage: { width: '100%', height: '82%' }, enlargedPdf: { minHeight: 300, borderRadius: radius.group, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.sm },
});
