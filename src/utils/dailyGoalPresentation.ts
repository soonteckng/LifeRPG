/** Both sides use minutes, including progress above an hour. Actual effort is never capped. */
export function dailyGoalRatio(completedSeconds: number, goalMinutes: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(completedSeconds) ? completedSeconds : 0));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  const goal = Math.max(1, Math.floor(Number.isFinite(goalMinutes) ? goalMinutes : 60));
  return remainder ? `${minutes} min ${remainder} sec / ${goal} min` : `${minutes} / ${goal} min`;
}
