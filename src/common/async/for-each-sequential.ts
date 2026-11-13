/** Run dependent operations in input order; stop immediately when one fails. */
export function forEachSequential<T>(
  values: Iterable<T>,
  action: (value: T, index: number) => Promise<unknown>,
): Promise<void> {
  return Array.from(values).reduce<Promise<void>>(
    (previous, value, index) =>
      previous.then(async () => {
        await action(value, index);
      }),
    Promise.resolve(),
  );
}
