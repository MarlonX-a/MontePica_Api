import { describe, expect, it } from 'vitest';
import { calculateEarnedPoints } from './points-arithmetic.js';

describe('Accrual arithmetic', () => {
  it.each([
    [0n, 2, 0n],
    [99n, 2, 0n],
    [100n, 2, 2n],
    [199n, 2, 2n],
    [650n, 3, 18n],
  ])(
    'rounds each payment down without fractional carry (%s)',
    (cents, rate, points) => {
      expect(calculateEarnedPoints(cents, rate)).toBe(points);
    },
  );
  it('rejects overflowing results and invalid bases', () => {
    expect(() => calculateEarnedPoints(900719925474099100n, 1000)).toThrow();
    expect(() => calculateEarnedPoints(-1n, 1)).toThrow();
  });
});
