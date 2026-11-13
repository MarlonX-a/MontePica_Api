/** Preserve invalid values so class-validator can reject them. */
export function booleanQueryValue(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}
