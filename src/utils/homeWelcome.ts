export function homeWelcome(hour: number, username?: string) {
  const name = username?.trim() || "Hero";
  if (hour < 5) return `Welcome back, ${name}`;
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${greeting}, ${name}`;
}
