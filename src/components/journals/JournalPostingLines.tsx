import type { JournalEntryRow } from '@/features/journals/api/journalsApi';
import { journalCreditTotal, journalDebitTotal, journalPostingLines } from '@/features/journals/journalPresentation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function JournalPostingLines({ entry }: { entry: JournalEntryRow }) {
  return <Table aria-label="Journal posting lines"><TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader><TableBody>
    {journalPostingLines(entry).map(line => <TableRow key={line.id}><TableCell>{line.accountName}</TableCell><TableCell className="text-right">${line.debitAmount}</TableCell><TableCell className="text-right">${line.creditAmount}</TableCell></TableRow>)}
    <TableRow><TableCell>Total debits</TableCell><TableCell className="text-right font-semibold">${journalDebitTotal(entry)}</TableCell><TableCell /></TableRow>
    <TableRow><TableCell>Total credits</TableCell><TableCell /><TableCell className="text-right font-semibold">${journalCreditTotal(entry)}</TableCell></TableRow>
  </TableBody></Table>;
}
