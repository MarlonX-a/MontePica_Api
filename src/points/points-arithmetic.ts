import { ConflictException } from '@nestjs/common';

export function calculateEarnedPoints(
  productsCents: bigint,
  rate: number,
): bigint {
  if (productsCents < 0n || !Number.isInteger(rate) || rate < 1 || rate > 1000)
    throw new ConflictException('Base o tasa inválida.');
  const points = (productsCents / 100n) * BigInt(rate);
  if (points > BigInt(Number.MAX_SAFE_INTEGER))
    throw new ConflictException('Puntos exceden el rango permitido.');
  return points;
}
