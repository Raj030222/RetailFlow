export const DEFAULT_MAX_RECORDS = 1_000_000;
export const DEFAULT_MAX_REPETITIONS = 20;

export function parseIntegerInput(
  value: string,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${label} must be a whole number between ${minimum.toLocaleString()} and ${maximum.toLocaleString()}.`,
    );
  }
  return parsed;
}

export function parsePercentInput(value: string): number {
  if (value.trim() === "") {
    throw new Error("Invalid data percentage is required.");
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error("Invalid data percentage must be between 0 and 100.");
  }
  return parsed;
}
