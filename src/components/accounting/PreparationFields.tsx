import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const today = () => new Date().toISOString().slice(0, 10);
export function exactMoney(value: string): string {
  const match = /^(-?\d+)(?:\.(\d{0,2}))?$/.exec(value.trim());
  if (!match) throw new Error('Enter a decimal amount with no more than two decimal places.');
  return `${match[1]}.${(match[2] ?? '').padEnd(2, '0')}`;
}
export function PreparationField({ label, value, onChange, type = 'text', disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} /></div>;
}
export function PreparationCheck({ children, checked, onChange, disabled = false }: { children: ReactNode; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1 h-4 w-4 shrink-0 accent-primary" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} /><span>{children}</span></label>;
}
export function PreparationValue({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-wrap justify-between gap-2 border-b border-border py-2"><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">NZD {value}</dd></div>;
}
