import { Badge } from '@/components/ui/badge';
import type { QuoteStatus } from '../types';

const VARIANT: Record<QuoteStatus, 'secondary' | 'info' | 'success' | 'destructive' | 'warning' | 'default'> = {
  draft: 'secondary',
  sent: 'info',
  viewed: 'info',
  accepted: 'success',
  declined: 'destructive',
  expired: 'warning',
  converted: 'default',
};

const LABEL: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  converted: 'Converted',
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
