// Today's trail: every few focused minutes is one stop (the server says how
// many: 20 from Round 64), and every stop brings a find, up to the trail's end. The trail starts at camp each morning and passes through places
// with names, so a long day of focus feels like a long walk.
import { FIND_SECONDS } from "../services/rewardCatalog";

export const TRAIL_ZONES = [
  { name: "Meadow", color: "#86EFAC", from: 0 },
  { name: "Lantern Lake", color: "#93C5FD", from: 2 },
  { name: "Red Canyon", color: "#FDBA74", from: 4 },
  { name: "Starfall Ridge", color: "#C4B5FD", from: 6 },
] as const;

/** Stops walked so far today (fractional), from today's focused seconds and the server's find interval. */
export const trailStops = (seconds: number, findSeconds: number = FIND_SECONDS) => Math.max(0, seconds) / Math.max(1, findSeconds);
export function trailZone(stops: number) {
  return [...TRAIL_ZONES].reverse().find(zone => stops >= zone.from) ?? TRAIL_ZONES[0];
}

/** "1 h 15 m", "45 m", "0 m". */
export function walked(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60), h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h} h ${m} m` : `${m} m`;
}

/** Mixes two #RRGGBB colours; t = 0 is a, t = 1 is b. */
export function mix(a: string, b: string, t: number) {
  const k = Math.max(0, Math.min(1, t));
  const c = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return "#" + [0, 1, 2].map(i => Math.round(c(a, i) + (c(b, i) - c(a, i)) * k).toString(16).padStart(2, "0")).join("");
}

/**
 * How light the sky is during a session: night for most of it, then dawn
 * and day only near the end, so the change never pulls attention early.
 */
export function sessionLight(progress: number) {
  const t = Math.max(0, Math.min(1, (progress - 0.8) / 0.2));
  return Math.round(t * t * (3 - 2 * t) * 50) / 50;
}
