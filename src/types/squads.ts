/** Someone's character as their squad mates see it. */
export interface PlayerLook { look: unknown; equipped: Record<string, string>; background: string; frame: string | null; title: string | null }
/** look is null until they've opened the new character (older replies leave it out). */
export interface SquadMember { id: string; isYou: boolean; isOwner: boolean; name: string; avatar: string; level: number; streak: number; weekSeconds: number; focusingNow: boolean; look?: PlayerLook | null }
/** goalMinutes is the weekly squad goal the owner set, or null. */
export interface Squad { id: string; name: string; code: string; ownerIsYou: boolean; goalMinutes: number | null; members: SquadMember[] }
export type SquadStatus = "saved" | "limit" | "lead_limit" | "full" | "not_found" | "slow_down" | "not_owner";
