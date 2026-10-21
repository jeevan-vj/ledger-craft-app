import { Link } from 'react-router-dom';
import { quoteTimeline } from '../timeline';
import type { Quote } from '../types';

function formatWhen(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function QuoteTimeline({ quote }: { quote: Quote }) {
  const events = quoteTimeline(quote);
  return (
    <ol className="space-y-4" aria-label="Quote activity">
      {events.map((event) => (
        <li key={event.id} className="flex gap-3">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <div>
            <p className="font-medium">{event.label}</p>
            {event.detail && event.href ? (
              <Link to={event.href} className="text-sm text-primary underline">
                {event.detail}
              </Link>
            ) : event.detail ? (
              <p className="text-sm text-muted-foreground">{event.detail}</p>
            ) : null}
            {event.at ? <p className="text-xs text-muted-foreground">{formatWhen(event.at)}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
