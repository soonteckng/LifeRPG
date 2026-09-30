export function validatedSessionMinutes(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const minutes = Number(text);
  return minutes >= 1 && minutes <= 480 ? minutes : null;
}

export function sessionTime(seconds: number) {
  const value = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}
