import { useAuth } from '@/context/StableAuthContext';
import { useEffect, useState } from 'react';
import type { GstPeriodsResponse, TaxReturnDto } from '@ledgercraft/contracts';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { GstPreparationPanel } from '@/components/accounting/GstPreparationPanel';
import { CompanyTaxPreparationPanel } from '@/components/accounting/CompanyTaxPreparationPanel';
import { downloadCompanyTaxPdf } from '@/features/accounting-completion/companyTaxPdf';
import { GstPeriodsOverview, type GstPeriodRow } from '@/features/tax/GstPeriodsOverview';
import { GstSavedReturn } from '@/features/tax/GstSavedReturn';
import { gstSettingsApi } from '@/features/tax/gstSettingsApi';

export default function IRDReportingPage() {
  const { me } = useAuth(); const canWrite = me?.permissions.includes('banking.write') === true;
  const [data, setData] = useState<GstPeriodsResponse>(); const [records, setRecords] = useState<TaxReturnDto[]>([]);
  const [period, setPeriod] = useState<GstPeriodRow>(); const [selected, setSelected] = useState<TaxReturnDto>();
  const [worksheet, setWorksheet] = useState<'gst' | 'company'>('gst');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function load() {
    setBusy(true); setError('');
    try { const [overview, returns] = await Promise.all([gstSettingsApi.periods(), gstSettingsApi.returns()]); setData(overview); setRecords(returns.taxReturns); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Tax records are unavailable.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function view(id: string) {
    setBusy(true); setError('');
    try { setSelected(await gstSettingsApi.getReturn(id)); setWorksheet('gst'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Saved return is unavailable.'); }
    finally { setBusy(false); }
  }
  function prepare(value: GstPeriodRow) { setPeriod(value); setSelected(undefined); setWorksheet('gst'); }
  async function companyPdf(record: TaxReturnDto) {
    setError('');
    try { if (!record.returnData?.companyIncomeTax) throw new Error('This record has no reviewed company worksheet.'); await downloadCompanyTaxPdf(record.returnData.companyIncomeTax); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Company worksheet unavailable.'); }
  }
  const basis = data?.settings.gstAccountingBasis;
  return <div className="space-y-6">
    <PageHeader title="GST and tax records" description="Registered periods, reviewed calculations and retained filing confirmations" />
    <div className="flex flex-wrap gap-3"><Button variant={worksheet === 'gst' ? 'default' : 'outline'} onClick={() => setWorksheet('gst')}>GST periods and returns</Button>{canWrite && <Button variant={worksheet === 'company' ? 'default' : 'outline'} onClick={() => { setWorksheet('company'); setSelected(undefined); }}>Company tax worksheet</Button>}<Button variant="outline" disabled={busy} onClick={() => void load()}>Refresh tax records</Button></div>
    {error && <ContentPanel><p role="alert" className="text-sm text-destructive">{error}</p><Button className="mt-3" onClick={() => void load()}>Retry tax records</Button></ContentPanel>}
    {!data && busy && <ContentPanel><p role="status">Loading registered GST periods…</p></ContentPanel>}
    {worksheet === 'gst' && <>
      {data && <GstPeriodsOverview canWrite={canWrite} data={data} onPrepare={prepare} onView={id => void view(id)} />}
      {period && data?.settings.configured && basis && <GstPreparationPanel canWrite={canWrite} key={`${period.periodStart}-${period.periodEnd}-${basis}`} registeredBasis={basis} period={{ periodStart: period.periodStart, periodEnd: period.periodEnd, dueDate: period.dueDate }} onSaved={() => void load()} />}
      {selected?.returnType === 'GST' && <GstSavedReturn canWrite={canWrite} value={selected} onFiled={() => void load()} onPrepareNew={data?.settings.configured && data.periods.some(row => row.periodStart === selected.periodStart && row.periodEnd === selected.periodEnd) ? () => prepare(data.periods.find(row => row.periodStart === selected.periodStart && row.periodEnd === selected.periodEnd)!) : undefined} />}
      {data?.reviewRequired && <p className="text-sm text-muted-foreground">Your registered choices need review. <Link className="font-medium text-primary underline" to="/tax-config">Open GST settings</Link>.</p>}
      {records.filter(record => record.returnType === 'GST').length > 0 && <ContentPanel><section aria-label="Retained GST records" className="space-y-4"><h2 className="text-lg font-semibold">Retained GST records</h2><p className="text-sm text-muted-foreground">Historical drafts and filed snapshots retain the settings used when they were prepared.</p><ul className="divide-y divide-border">{records.filter(record => record.returnType === 'GST').map(record => <li key={record.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><span className="text-sm">{record.periodStart} to {record.periodEnd} · {record.status === 'submitted' ? 'Recorded as filed' : record.status} · NZD {record.netGst}{record.irdReference && ` · ${record.irdReference}`}</span><Button variant="outline" onClick={() => void view(record.id)}>View saved GST record</Button></li>)}</ul></section></ContentPanel>}
    </>}
    {worksheet === 'company' && <><CompanyTaxPreparationPanel onSaved={() => void load()} />{records.filter(record => record.returnType === 'Income_Tax').map(record => <ContentPanel key={record.id}><div className="flex flex-wrap items-center justify-between gap-3"><p>{record.periodStart} to {record.periodEnd} · NZD {record.netGst}</p><Button variant="outline" onClick={() => void companyPdf(record)}>Download company worksheet</Button></div></ContentPanel>)}</>}
    <p className="text-xs text-muted-foreground">Nothing on this page submits to IRD. File separately in myIR and retain the actual confirmation reference. Your accountant should confirm registration choices and tax treatment.</p>
  </div>;
}
