export const DAILY_GOAL_PRESETS = [30, 60, 90, 120] as const;
export function validateDailyGoal(value: number) {
  return Number.isInteger(value) && value >= 15 && value <= 480
    ? "" : "Enter a whole number of minutes between 15 and 480.";
}
export function parseDailyGoal(value: string) {
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
}
