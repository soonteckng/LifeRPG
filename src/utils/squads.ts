import type { Squad, SquadMember } from "../types/squads";

export const SQUAD_CODE_LENGTH = 6;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const anyUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);

export function validSquadMember(value: unknown): value is SquadMember {
  return object(value) && anyUuid(value.id) && typeof value.isYou === "boolean" && typeof value.isOwner === "boolean" && typeof value.name === "string" && value.name.length <= 80
    && typeof value.avatar === "string" && value.avatar.length <= 80 && count(value.level) && count(value.streak) && count(value.weekSeconds) && typeof value.focusingNow === "boolean"
    && (value.look === undefined || value.look === null || object(value.look));
}
export function validSquad(value: unknown): value is Squad {
  return object(value) && anyUuid(value.id) && typeof value.name === "string" && value.name.length <= 40 && typeof value.code === "string" && /^[A-HJ-NP-Z2-9]{6}$/.test(value.code)
    && typeof value.ownerIsYou === "boolean" && (value.goalMinutes === undefined || value.goalMinutes === null || typeof value.goalMinutes === "number" && Number.isSafeInteger(value.goalMinutes) && value.goalMinutes >= 60 && value.goalMinutes <= 6000)
    && Array.isArray(value.members) && value.members.length <= 8 && value.members.every(validSquadMember);
}
/** Codes are typed loosely; keep only the characters a code can contain. */
export function cleanSquadCode(input: string): string {
  return input.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, SQUAD_CODE_LENGTH);
}
export function validSquadName(name: string): boolean {
  return name.length > 0 && name.length <= 40 && name === name.trim() && !/[\u0000-\u001f\u007f]/.test(name);
}
/** Monday 00:00 of this local week. */
export function weekStart(now = new Date()): number {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  return start.getTime();
}
export const SQUAD_GOALS = [300, 600, 900, 1200, 1800] as const;
export function squadTotal(squad: Squad): number { return squad.members.reduce((sum, member) => sum + member.weekSeconds, 0); }
export function focusingCount(squad: Squad): number { return squad.members.filter(member => member.focusingNow).length; }
export type Standing = { member: SquadMember; place: number | null };
const byName = (a: SquadMember, b: SquadMember) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);
/**
 * This week's leaderboard. Only someone who has focused this week is ranked;
 * equal time shares a place (1, 1, 3), so joining earlier never wins a tie.
 * Everyone else follows, unranked (place null), in name order.
 */
export function standings(squad: Squad): Standing[] {
  const active = squad.members.filter(member => member.weekSeconds > 0).sort((a, b) => b.weekSeconds - a.weekSeconds || byName(a, b));
  const waiting = squad.members.filter(member => member.weekSeconds <= 0).sort(byName);
  return [
    ...active.map(member => ({ member, place: 1 + active.filter(other => other.weekSeconds > member.weekSeconds).length })),
    ...waiting.map(member => ({ member, place: null })),
  ];
}
/** Members in leaderboard order: most focus first, then those yet to start. */
export function ranked(squad: Squad): SquadMember[] {
  return standings(squad).map(item => item.member);
}
/** Free limits, also enforced by the server: lead one squad, belong to three. */
export const SQUAD_LIMITS = { lead: 1, member: 3 } as const;
/** Weekly goal progress, 0 to 1, or null without a goal. */
export function goalProgress(squad: Squad): number | null {
  return squad.goalMinutes ? Math.min(1, squadTotal(squad) / (squad.goalMinutes * 60)) : null;
}
/** What leaving does, said before it happens. */
export function leaveOutcome(squad: Squad): string {
  if (squad.members.length <= 1) return "You're the only member, so the squad closes and its invite code stops working.";
  if (squad.ownerIsYou) return "The member who's been here longest becomes the leader. You can rejoin with the code.";
  return "You can join again with the code.";
}
export const squadMessage: Record<string, string> = {
  limit: `You can be in up to ${SQUAD_LIMITS.member} squads. Leave one to join another.`,
  lead_limit: "You already lead a squad. Leave it before starting a new one.",
  full: "That squad is full. Squads hold up to 8 people.",
  not_found: "No squad has that code. Check it with your friend.",
  slow_down: "Too many tries. Wait a while before trying another code.",
  not_owner: "Only the squad's leader can do that.",
};
