import { forEachSequential } from './for-each-sequential.js';

describe('forEachSequential', () => {
  it('waits for each operation before starting the next', async () => {
    const events: string[] = [];
    await forEachSequential([1, 2], async (value) => {
      events.push(`start:${value}`);
      await Promise.resolve();
      events.push(`end:${value}`);
    });
    expect(events).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
  });

  it('propagates the failure without running later operations', async () => {
    const visited: number[] = [];
    await expect(
      forEachSequential([1, 2, 3], async (value) => {
        visited.push(value);
        if (value === 2) throw new Error('write failed');
        await Promise.resolve();
      }),
    ).rejects.toThrow('write failed');
    expect(visited).toEqual([1, 2]);
  });
});
