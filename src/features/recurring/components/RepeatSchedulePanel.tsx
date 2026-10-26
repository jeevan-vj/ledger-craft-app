import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RecurringSchedule } from '@ledgercraft/contracts';
import { CalendarDays, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { recurringApi } from '../api';

export type InvoiceDeliverySettings = {
  mode: 'draft' | 'auto';
  whenEmailUnavailable?: 'draft' | 'mark_sent';
};

export type RepeatSettings = {
  schedule: RecurringSchedule;
  delivery: InvoiceDeliverySettings;
};

type EndMode = 'never' | 'date' | 'occurrences';
type RecurringCustomUnit = 'day' | 'week' | 'month' | 'year';

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Pacific/Auckland';
  } catch {
    return 'Pacific/Auckland';
  }
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// eslint-disable-next-line react-refresh/only-export-components
export function defaultRepeatSettings(timezone = browserTimezone(), startDate = today()): RepeatSettings {
  const startDay = Math.min(31, Math.max(1, Number(startDate.slice(8, 10)) || 1));
  return {
    schedule: {
      frequency: 'monthly',
      interval: 1,
      startDate,
      timezone,
      localTime: '09:00',
      dayOfMonth: startDay,
    },
    delivery: { mode: 'draft', whenEmailUnavailable: 'draft' },
  };
}

function scheduleUnit(schedule: RecurringSchedule): RecurringCustomUnit {
  if (schedule.frequency === 'custom') return schedule.customUnit ?? 'month';
  if (schedule.frequency === 'daily') return 'day';
  if (schedule.frequency === 'weekly') return 'week';
  if (schedule.frequency === 'annual') return 'year';
  return 'month';
}

function mapRepeat(unit: RecurringCustomUnit, interval: number): Pick<RecurringSchedule, 'frequency' | 'interval' | 'customUnit'> {
  if (interval > 1) return { frequency: 'custom', interval, customUnit: unit };
  const frequency = unit === 'day' ? 'daily' : unit === 'week' ? 'weekly' : unit === 'year' ? 'annual' : 'monthly';
  return { frequency, interval: 1, customUnit: null };
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

export function RepeatSchedulePanel({
  value,
  onChange,
  showDelivery = true,
  disabled = false,
}: {
  value: RepeatSettings;
  onChange: (value: RepeatSettings) => void;
  showDelivery?: boolean;
  disabled?: boolean;
}) {
  const { schedule, delivery } = value;
  const unit = scheduleUnit(schedule);
  const endMode: EndMode = schedule.endDate ? 'date' : schedule.occurrenceLimit ? 'occurrences' : 'never';
  const [selectedEndMode, setSelectedEndMode] = useState<EndMode>(endMode);
  const debouncedSchedule = useDebouncedValue(schedule, 300);
  const scheduleKey = useMemo(() => JSON.stringify(debouncedSchedule), [debouncedSchedule]);
  const preview = useQuery({
    queryKey: ['recurring-preview', scheduleKey],
    queryFn: () => recurringApi.preview({ schedule: debouncedSchedule, count: 5 }),
    enabled: Boolean(debouncedSchedule.startDate && debouncedSchedule.timezone),
    staleTime: 30_000,
  });

  const changeSchedule = (patch: Partial<RecurringSchedule>) => {
    onChange({ ...value, schedule: { ...schedule, ...patch } });
  };
  const changeRepeat = (nextUnit: RecurringCustomUnit, nextInterval: number) => {
    const repeat = mapRepeat(nextUnit, Math.min(365, Math.max(1, nextInterval || 1)));
    const usesDayOfMonth = nextUnit === 'month' || nextUnit === 'year';
    changeSchedule({
      ...repeat,
      dayOfMonth: usesDayOfMonth ? schedule.dayOfMonth ?? Number(schedule.startDate.slice(8, 10)) : undefined,
    });
  };
  const changeEndMode = (mode: EndMode) => {
    setSelectedEndMode(mode);
    if (mode === 'never') changeSchedule({ endDate: null, occurrenceLimit: null });
    if (mode === 'date') changeSchedule({ endDate: schedule.endDate ?? schedule.startDate, occurrenceLimit: null });
    if (mode === 'occurrences') changeSchedule({ endDate: null, occurrenceLimit: schedule.occurrenceLimit ?? 12 });
  };

  return (
    <div className="space-y-6 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h3 className="font-semibold text-foreground">Repeat schedule</h3>
        <p className="mt-1 text-sm text-muted-foreground">Choose when this document is created and how it is delivered.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="repeat-interval">Every</Label>
          <div className="grid grid-cols-[minmax(5rem,0.7fr)_minmax(8rem,1.3fr)] gap-2">
            <Input
              id="repeat-interval"
              aria-label="Repeat interval"
              type="number"
              min={1}
              max={365}
              value={schedule.interval}
              disabled={disabled}
              onChange={(event) => changeRepeat(unit, Number(event.target.value))}
            />
            <Select value={unit} disabled={disabled} onValueChange={(next) => changeRepeat(next as RecurringCustomUnit, schedule.interval)}>
              <SelectTrigger aria-label="Repeat unit"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">day(s)</SelectItem>
                <SelectItem value="week">week(s)</SelectItem>
                <SelectItem value="month">month(s)</SelectItem>
                <SelectItem value="year">year(s)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {(unit === 'month' || unit === 'year') && (
          <div className="space-y-2">
            <Label>Day of month</Label>
            <Select
              value={String(schedule.dayOfMonth ?? Number(schedule.startDate.slice(8, 10)))}
              disabled={disabled}
              onValueChange={(day) => changeSchedule({ dayOfMonth: day === 'last' ? 'last' : Number(day) })}
            >
              <SelectTrigger aria-label="Day of month"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                  <SelectItem key={day} value={String(day)}>{day}{day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th'}</SelectItem>
                ))}
                <SelectItem value="last">Last day of month</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Dates from the 29th to 31st use the last day in shorter months.</p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="repeat-start-date">Start date</Label>
          <Input id="repeat-start-date" type="date" value={schedule.startDate} disabled={disabled} onChange={(event) => changeSchedule({ startDate: event.target.value })} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="repeat-time">Time</Label>
          <Input id="repeat-time" type="time" value={schedule.localTime} disabled={disabled} onChange={(event) => changeSchedule({ localTime: event.target.value })} />
          <p className="text-xs text-muted-foreground">{schedule.timezone}</p>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Ends</legend>
        <RadioGroup value={selectedEndMode} onValueChange={(mode) => changeEndMode(mode as EndMode)} className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2"><RadioGroupItem value="never" disabled={disabled} />Never</label>
          <label className="flex items-center gap-2"><RadioGroupItem value="date" disabled={disabled} />On date</label>
          <label className="flex items-center gap-2"><RadioGroupItem value="occurrences" disabled={disabled} />After occurrences</label>
        </RadioGroup>
        {selectedEndMode === 'date' && <Input aria-label="End date" type="date" min={schedule.startDate} value={schedule.endDate ?? schedule.startDate} disabled={disabled} onChange={(event) => changeSchedule({ endDate: event.target.value })} />}
        {selectedEndMode === 'occurrences' && <Input aria-label="Number of occurrences" type="number" min={1} max={10_000} value={schedule.occurrenceLimit ?? 12} disabled={disabled} onChange={(event) => changeSchedule({ occurrenceLimit: Number(event.target.value) })} />}
      </fieldset>

      {showDelivery && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Delivery</legend>
          <RadioGroup value={delivery.mode} onValueChange={(mode) => onChange({ ...value, delivery: { ...delivery, mode: mode as InvoiceDeliverySettings['mode'] } })} className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2"><RadioGroupItem value="draft" disabled={disabled} />Save as draft</label>
            <label className="flex items-center gap-2"><RadioGroupItem value="auto" disabled={disabled} />Send automatically</label>
          </RadioGroup>
          {delivery.mode === 'auto' && (
            <div className="space-y-2">
              <Label>If email is unavailable</Label>
              <Select value={delivery.whenEmailUnavailable ?? 'draft'} disabled={disabled} onValueChange={(fallback) => onChange({ ...value, delivery: { ...delivery, whenEmailUnavailable: fallback as 'draft' | 'mark_sent' } })}>
                <SelectTrigger aria-label="When email is unavailable"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Keep as draft</SelectItem>
                  <SelectItem value="mark_sent">Mark as sent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </fieldset>
      )}

      <div aria-live="polite" className="rounded-xl bg-muted p-4">
        <div className="flex items-center gap-2 text-sm font-medium"><CalendarDays className="h-4 w-4" />Next 5 dates</div>
        {preview.isLoading || preview.isFetching ? <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading dates…</p> : preview.isError ? <p role="alert" className="mt-3 text-sm text-destructive">Unable to preview dates. Check the schedule and try again.</p> : (
          <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {preview.data?.occurrences.map((occurrence) => (
              <li key={occurrence.runAt} className="tabular-nums text-foreground">
                {new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', timeZone: schedule.timezone }).format(new Date(occurrence.runAt))}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
