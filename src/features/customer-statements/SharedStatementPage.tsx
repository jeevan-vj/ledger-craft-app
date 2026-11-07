import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { applyNoReferrerPolicy } from '@/lib/referrerPolicy';
import { Button } from '@/components/ui/button';
import { statementApi } from './statementApi';
import { statementPdf } from './statementPdf';
import { StatementDocument } from './StatementDocument';
export default function SharedStatementPage() {
  const { token = '' } = useParams(); useEffect(() => { applyNoReferrerPolicy(); }, []);
  const query = useQuery({ queryKey: ['shared-customer-statement', token], queryFn: () => statementApi.public(token), retry: false });
  return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">{query.isPending && <p role="status">Loading statement…</p>}{query.error && <p role="alert">This statement is unavailable or expired.</p>}{query.data && <><Button onClick={() => statementPdf(query.data)}>Download statement PDF</Button><StatementDocument value={query.data} /></>}</main>;
}
