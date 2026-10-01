export function validatedSessionMinutes(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const minutes = Number(text);
  return minutes >= 1 && minutes <= 480 ? minutes : null;
}

export function sessionTime(seconds: number) {
  const value = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}

export const MAX_SESSION_SECONDS = 480 * 60;

export function validSessionSeconds(seconds: number): boolean {
  return Number.isInteger(seconds) && seconds > 0 && seconds <= MAX_SESSION_SECONDS;
}

export function durationLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return [minutes > 0 ? `${minutes} min` : null, remainder > 0 || minutes === 0 ? `${remainder} sec` : null].filter(Boolean).join(" ");
}
