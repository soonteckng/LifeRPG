export interface SquadMember { id: string; isYou: boolean; isOwner: boolean; name: string; avatar: string; level: number; streak: number; weekSeconds: number; focusingNow: boolean }
export interface Squad { id: string; name: string; code: string; ownerIsYou: boolean; members: SquadMember[] }
export type SquadStatus = "saved" | "limit" | "full" | "not_found" | "slow_down" | "not_owner";
