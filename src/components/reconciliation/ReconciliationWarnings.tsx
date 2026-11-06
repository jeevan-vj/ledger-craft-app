import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function ReconciliationWarnings({ warnings }: { warnings?: string[] }) {
  if (!warnings?.length) return null;
  return <Alert variant="destructive"><AlertTitle>Review historical adjustments</AlertTitle><AlertDescription><ul className="list-disc pl-4 space-y-1">{warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul><p className="mt-2">Post any missing expense, receipt or correcting journal before completing the statement.</p></AlertDescription></Alert>;
}
