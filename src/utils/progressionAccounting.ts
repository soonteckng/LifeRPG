/** Version 1 is advertised only for a result credited by the new server. */
export interface DailyCredit {
  completed_minutes: number;
  completed_seconds?: number | null;
  credit_version?: number | null;
}
export function creditedDailySeconds(row: DailyCredit): number {
  if (row.credit_version === 1 && Number.isSafeInteger(row.completed_seconds) && row.completed_seconds! >= 0)
    return row.completed_seconds!;
  return Math.max(0, Math.floor(row.completed_minutes || 0)) * 60;
}
export function hasExactDailyCredit(row: DailyCredit): boolean {
  return row.credit_version === 1 && Number.isSafeInteger(row.completed_seconds) && row.completed_seconds! >= 0;
}
/** Integer reference model for tests/previews; server remains authoritative. */
export function bankSeconds(seconds: number, remainder: number) {
  if (!Number.isSafeInteger(seconds) || seconds < 0 || !Number.isInteger(remainder) || remainder < 0 || remainder > 59)
    throw new Error("Invalid focus credit");
  const total = seconds + remainder;
  if (!Number.isSafeInteger(total)) throw new Error("Focus credit overflow");
  return { xp: Math.floor(total / 60), remainder: total % 60 };
}
