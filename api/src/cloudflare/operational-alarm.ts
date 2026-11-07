/** Run independent jobs without letting one provider starve the other jobs.
 * Failed jobs retry after fifteen minutes, not on every alarm loop. */
export async function runOperationalJobs(jobs: Array<() => Promise<number | null>>, now: number) {
  const results = await Promise.allSettled(jobs.map(job => job()));
  const next = results.map(result => result.status === 'fulfilled' ? result.value : now + 15 * 60_000).filter((value): value is number => value !== null && Number.isFinite(value));
  return { nextAlarmAt: next.length ? new Date(Math.min(...next)).toISOString() : null };
}
