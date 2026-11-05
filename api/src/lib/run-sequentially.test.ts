import { describe, expect, it } from 'vitest';
import { runSequentially } from './run-sequentially';

describe('runSequentially', () => {
  it('waits for each operation in input order and stops after a failure', async () => {
    const order: string[] = [];
    await runSequentially(['first', 'second'], async (value) => {
      order.push(`start:${value}`);
      await Promise.resolve();
      order.push(`end:${value}`);
    });
    expect(order).toEqual(['start:first', 'end:first', 'start:second', 'end:second']);

    await expect(runSequentially(['kept', 'failed', 'skipped'], async (value) => {
      order.push(value);
      if (value === 'failed') throw new Error('stop');
    })).rejects.toThrow('stop');
    expect(order).not.toContain('skipped');
  });
});
