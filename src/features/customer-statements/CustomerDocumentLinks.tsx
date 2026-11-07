import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
export function CustomerDocumentLinks({ customer }: { customer: { id: string; name: string } }) {
  return <div className="flex flex-wrap gap-1"><Button variant="ghost" size="sm" asChild><Link to={`/quotes?customerId=${encodeURIComponent(customer.id)}`} aria-label={`Quotes for ${customer.name}`}>Quotes</Link></Button><Button variant="ghost" size="sm" asChild><Link to={`/customer-statements?customerId=${encodeURIComponent(customer.id)}`} aria-label={`Statement for ${customer.name}`}>Statement</Link></Button></div>;
}
