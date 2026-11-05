/** Run order-sensitive async work one item at a time, stopping on the first failure. */
export function runSequentially<T>(
  values: Iterable<T>,
  operation: (value: T) => Promise<void>,
): Promise<void> {
  return Array.from(values).reduce<Promise<void>>(
    (pending, value) => pending.then(() => operation(value)),
    Promise.resolve(),
  );
}
