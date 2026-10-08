// This matches the character curve used by the session-credit RPC. Tiers are
// milestones on that curve; they do not award XP or reset an earned balance.
export function requiredCharacterXP(level: number): number {
  return Math.floor(100 * Math.pow(Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1, 1.5));
}
const stages = [
  { level: 1, title: "First steps", detail: "Make a little room for focus.", color: "#AAB3FF", icon: "footsteps-outline" },
  { level: 3, title: "Spark", detail: "A beginning worth returning to.", color: "#79BFF2", icon: "sparkles-outline" },
  { level: 6, title: "Momentum", detail: "Small blocks start to add up.", color: "#6DD4B5", icon: "trail-sign-outline" },
  { level: 10, title: "Rhythm", detail: "Build a practice at your own pace.", color: "#F4AA88", icon: "musical-notes-outline" },
  { level: 15, title: "Flow", detail: "Give what matters your attention.", color: "#C1A8FA", icon: "water-outline" },
  { level: 21, title: "Dedication", detail: "Time invested becomes lasting growth.", color: "#E98ABC", icon: "flame-outline" },
  { level: 28, title: "Resolve", detail: "Keep making space, one block at a time.", color: "#91CFDF", icon: "shield-checkmark-outline" },
  { level: 36, title: "Radiance", detail: "A steady practice begins to shine.", color: "#D6BAF5", icon: "sunny-outline" },
  { level: 45, title: "Harmony", detail: "Make focus a part of your everyday rhythm.", color: "#86CDBD", icon: "leaf-outline" },
  { level: 55, title: "Insight", detail: "Patience gives your practice depth.", color: "#9DBBEE", icon: "telescope-outline" },
  { level: 70, title: "Mastery", detail: "Celebrate the time you have invested.", color: "#D6B98A", icon: "diamond-outline" },
  { level: 100, title: "Legacy", detail: "Keep growing, with no final level.", color: "#BFA9F0", icon: "infinite-outline" },
] as const;
function xpBeforeLevel(level: number) {
  let total = 0;
  for (let previous = 1; previous < level; previous++) total += requiredCharacterXP(previous);
  return total;
}
export const LEVEL_TIERS = stages.map(stage => ({ ...stage, totalXP: xpBeforeLevel(stage.level) }));
export function levelTierProgress(level: number, currentXP: number) {
  const safeLevel = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  const index = Math.max(0, LEVEL_TIERS.findLastIndex(tier => safeLevel >= tier.level));
  const current = LEVEL_TIERS[index], next = LEVEL_TIERS[index + 1] ?? null;
  if (!next) return { current, next, remainingXP: 0, fraction: 1 };
  // Only loop across the finite catalogue (at most 99 levels), even for a
  // malformed or very high saved level. Current XP is the within-level balance.
  const total = xpBeforeLevel(safeLevel) + Math.min(requiredCharacterXP(safeLevel), Math.max(0, Number.isFinite(currentXP) ? currentXP : 0));
  return { current, next, remainingXP: Math.max(0, next.totalXP - total), fraction: Math.max(0, Math.min(1, (total - current.totalXP) / (next.totalXP - current.totalXP))) };
}
