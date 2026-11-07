import { financialReportRows, type FinancialReportResponse } from '@ledgercraft/contracts';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function PeriodColumnTable({ report, section }: { report: FinancialReportResponse; section: 'profit-loss' | 'cash-flow' }) {
  const [header, ...rows] = financialReportRows(report, section);
  const columnWidth = 160;
  return <div
    className="max-w-full overflow-x-auto [--report-account-width:144px] sm:[--report-account-width:224px]"
    role="region"
    aria-label={`${section === 'profit-loss' ? 'Profit and loss' : 'Cash flow'} period columns`}
    tabIndex={0}
  >
    <table className="table-fixed caption-bottom text-sm" style={{ width: `calc(var(--report-account-width) + ${(header.length - 1) * columnWidth}px)` }}>
      <colgroup><col style={{ width: 'var(--report-account-width)' }} />{header.slice(1).map((_, index) => <col key={index} style={{ width: columnWidth }} />)}</colgroup>
      <TableHeader><TableRow>{header.map((label, index) => <TableHead key={`${index}-${label}`} className={index === 0 ? 'sticky left-0 z-10 whitespace-normal break-words bg-card' : 'whitespace-normal text-right'}>{label}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{rows.map((row, index) => <TableRow key={index}>{row.map((cell, column) => <TableCell key={column} className={column === 0 ? 'sticky left-0 whitespace-normal break-words bg-card font-medium' : 'text-right tabular-nums'}>{cell}</TableCell>)}</TableRow>)}</TableBody>
    </table>
  </div>;
}
