import type { Squad, SquadMember } from "../types/squads";

export const SQUAD_CODE_LENGTH = 6;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const anyUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);

export function validSquadMember(value: unknown): value is SquadMember {
  return object(value) && anyUuid(value.id) && typeof value.isYou === "boolean" && typeof value.isOwner === "boolean" && typeof value.name === "string" && value.name.length <= 80
    && typeof value.avatar === "string" && value.avatar.length <= 80 && count(value.level) && count(value.streak) && count(value.weekSeconds) && typeof value.focusingNow === "boolean";
}
export function validSquad(value: unknown): value is Squad {
  return object(value) && anyUuid(value.id) && typeof value.name === "string" && value.name.length <= 40 && typeof value.code === "string" && /^[A-HJ-NP-Z2-9]{6}$/.test(value.code)
    && typeof value.ownerIsYou === "boolean" && Array.isArray(value.members) && value.members.length <= 8 && value.members.every(validSquadMember);
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
export function squadTotal(squad: Squad): number { return squad.members.reduce((sum, member) => sum + member.weekSeconds, 0); }
export function focusingCount(squad: Squad): number { return squad.members.filter(member => member.focusingNow).length; }
/** Most focus first; ties keep join order. */
export function ranked(squad: Squad): SquadMember[] {
  return squad.members.map((member, index) => ({ member, index })).sort((a, b) => b.member.weekSeconds - a.member.weekSeconds || a.index - b.index).map(item => item.member);
}
export const squadMessage: Record<string, string> = {
  limit: "You're in 5 squads already. Leave one to join another.",
  full: "That squad is full. Squads hold up to 8 people.",
  not_found: "No squad has that code. Check it with your friend.",
  slow_down: "Too many tries. Wait a while before trying another code.",
  not_owner: "Only the squad's owner can do that.",
};
