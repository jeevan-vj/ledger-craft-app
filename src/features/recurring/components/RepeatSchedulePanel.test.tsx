import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recurringApi } from '../api';
import {
  defaultRepeatSettings,
  RepeatSchedulePanel,
  type RepeatSettings,
} from './RepeatSchedulePanel';

vi.mock('../api', () => ({
  recurringApi: { preview: vi.fn() },
}));

function renderPanel(value: RepeatSettings, onChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    onChange,
    ...render(
      <QueryClientProvider client={client}>
        <RepeatSchedulePanel value={value} onChange={onChange} />
      </QueryClientProvider>,
    ),
  };
}

describe('RepeatSchedulePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(recurringApi.preview).mockResolvedValue({
      occurrences: [
        { runAt: '2026-11-30T20:00:00.000Z', localDate: '2026-12-01' },
        { runAt: '2026-12-31T20:00:00.000Z', localDate: '2027-01-01' },
        { runAt: '2027-01-28T20:00:00.000Z', localDate: '2027-03-01' },
        { runAt: '2027-03-31T20:00:00.000Z', localDate: '2027-04-01' },
        { runAt: '2027-04-30T20:00:00.000Z', localDate: '2027-05-01' },
      ],
    });
  });

  it('requests and renders five preview dates including the selected day of month', async () => {
    const value = defaultRepeatSettings('Pacific/Auckland', '2026-12-01');
    value.schedule = { ...value.schedule, frequency: 'monthly', dayOfMonth: 31 };

    renderPanel(value);

    expect(await screen.findByText('1 Dec 2026')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    await waitFor(() => {
      expect(recurringApi.preview).toHaveBeenCalledWith({
        schedule: expect.objectContaining({ dayOfMonth: 31, frequency: 'monthly' }),
        count: 5,
      });
    });
  });

  it('maps every two months to a custom month schedule', () => {
    const value = defaultRepeatSettings('Pacific/Auckland', '2026-12-01');
    const { onChange } = renderPanel(value);

    fireEvent.change(screen.getByLabelText('Repeat interval'), { target: { value: '2' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      schedule: expect.objectContaining({ frequency: 'custom', interval: 2, customUnit: 'month' }),
    }));
  });
});
