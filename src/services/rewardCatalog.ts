// Names, slots and rarities for every reward. The server decides who gets
// what (supabase/migrations/20261024090000_rewards_core.sql); this list must
// match its item ids, which a test checks.

export type RewardRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type RewardKind = "wearable" | "pet" | "frame" | "background" | "decor" | "title";
export type WearSlot = "head" | "face" | "neck" | "top" | "back" | "bag" | "held" | "shoes" | "pet";
export type OutfitSet = "scholar" | "artist" | "wanderer";

export interface RewardItem {
  id: string;
  name: string;
  kind: RewardKind;
  rarity: RewardRarity;
  slot?: WearSlot;
  set?: OutfitSet;
  free?: boolean;
  price?: number;
  /** How to get it, for locked items. */
  hint: string;
}

const find = "Find it on an expedition";
const trader = (price: number) => `${find}, or ${price} Stardust at the trader`;
const pack = (price: number) => `Found in daily supply packs, or ${price} Stardust at the trader`;

export const REWARD_ITEMS: readonly RewardItem[] = [
  { id: "glasses", name: "Round glasses", kind: "wearable", slot: "face", rarity: "common", free: true, hint: "Free for everyone" },
  { id: "cardigan", name: "Oat cardigan", kind: "wearable", slot: "top", set: "scholar", rarity: "uncommon", price: 120, hint: trader(120) },
  { id: "tie", name: "Red tie", kind: "wearable", slot: "neck", set: "scholar", rarity: "common", price: 60, hint: trader(60) },
  { id: "book_bag", name: "Book bag", kind: "wearable", slot: "bag", set: "scholar", rarity: "common", price: 60, hint: trader(60) },
  { id: "notebook", name: "Notebook", kind: "wearable", slot: "held", set: "scholar", rarity: "rare", price: 240, hint: trader(240) },
  { id: "overalls", name: "Denim overalls", kind: "wearable", slot: "top", set: "artist", rarity: "uncommon", price: 120, hint: trader(120) },
  { id: "beret", name: "Red beret", kind: "wearable", slot: "head", set: "artist", rarity: "common", price: 60, hint: trader(60) },
  { id: "tote", name: "Canvas tote", kind: "wearable", slot: "bag", set: "artist", rarity: "common", price: 60, hint: trader(60) },
  { id: "sneakers", name: "Paint sneakers", kind: "wearable", slot: "shoes", set: "artist", rarity: "rare", price: 240, hint: trader(240) },
  { id: "field_jacket", name: "Field jacket", kind: "wearable", slot: "top", set: "wanderer", rarity: "uncommon", price: 120, hint: trader(120) },
  { id: "forest_cloak", name: "Forest cloak", kind: "wearable", slot: "back", set: "wanderer", rarity: "rare", price: 240, hint: trader(240) },
  { id: "walking_staff", name: "Walking staff", kind: "wearable", slot: "held", set: "wanderer", rarity: "common", price: 60, hint: trader(60) },
  { id: "trail_boots", name: "Trail boots", kind: "wearable", slot: "shoes", set: "wanderer", rarity: "common", price: 60, hint: trader(60) },
  { id: "pet_owl", name: "Barn owl", kind: "pet", slot: "pet", rarity: "epic", hint: "Joins you at 10 hours of focus" },
  { id: "pet_cat", name: "Sleepy cat", kind: "pet", slot: "pet", rarity: "epic", hint: "Joins you at 50 hours of focus" },
  { id: "pet_fox", name: "Little fox", kind: "pet", slot: "pet", rarity: "epic", hint: "Joins you at 100 hours of focus" },
  { id: "frame_streak_7", name: "7-day frame", kind: "frame", rarity: "uncommon", hint: "Focus 7 days in a row" },
  { id: "frame_streak_30", name: "30-day frame", kind: "frame", rarity: "rare", hint: "Focus 30 days in a row" },
  { id: "frame_streak_100", name: "100-day frame", kind: "frame", rarity: "epic", hint: "Focus 100 days in a row" },
  { id: "frame_streak_365", name: "365-day frame", kind: "frame", rarity: "legendary", hint: "Focus 365 days in a row" },
  { id: "title_scholar", name: "The Scholar", kind: "title", set: "scholar", rarity: "rare", hint: "Own every Scholar piece" },
  { id: "title_artist", name: "The Artist", kind: "title", set: "artist", rarity: "rare", hint: "Own every Artist piece" },
  { id: "title_wanderer", name: "Wanderer", kind: "title", set: "wanderer", rarity: "rare", hint: "Own every Wanderer piece" },
  { id: "bg_dusk", name: "Dusk", kind: "background", rarity: "common", free: true, hint: "Free for everyone" },
  { id: "bg_forest", name: "Forest", kind: "background", rarity: "common", price: 60, hint: pack(60) },
  { id: "bg_meadow", name: "Meadow", kind: "background", rarity: "common", price: 60, hint: pack(60) },
  { id: "bg_night", name: "Night sky", kind: "background", rarity: "uncommon", price: 120, hint: pack(120) },
  { id: "bg_library", name: "Library", kind: "background", rarity: "uncommon", price: 120, hint: pack(120) },
  { id: "bg_sunset", name: "Sunset", kind: "background", rarity: "rare", price: 240, hint: pack(240) },
  { id: "decor_signpost", name: "Signpost", kind: "decor", rarity: "common", price: 60, hint: trader(60) },
  { id: "decor_crates", name: "Crate stack", kind: "decor", rarity: "common", price: 60, hint: trader(60) },
  { id: "decor_easel", name: "Easel", kind: "decor", rarity: "common", price: 60, hint: trader(60) },
  { id: "decor_bonsai", name: "Bonsai", kind: "decor", rarity: "uncommon", price: 120, hint: trader(120) },
  { id: "decor_herb_garden", name: "Herb garden", kind: "decor", rarity: "uncommon", price: 120, hint: trader(120) },
  { id: "decor_hammock", name: "Hammock", kind: "decor", rarity: "uncommon", price: 120, hint: trader(120) },
  { id: "decor_reading_nook", name: "Reading nook", kind: "decor", rarity: "rare", price: 240, hint: trader(240) },
];

const byId = new Map(REWARD_ITEMS.map(item => [item.id, item]));
export const rewardItem = (id: string): RewardItem | undefined => byId.get(id);

export const SETS: Record<OutfitSet, { name: string; title: string }> = {
  scholar: { name: "Scholar", title: "title_scholar" },
  artist: { name: "Artist", title: "title_artist" },
  wanderer: { name: "Wanderer", title: "title_wanderer" },
};

export const setPieces = (set: OutfitSet) => REWARD_ITEMS.filter(item => item.kind === "wearable" && item.set === set);

export const PACK_TIERS = [
  { name: "Canvas", days: 1 },
  { name: "Leather", days: 3 },
  { name: "Brass", days: 7 },
  { name: "Crystal", days: 14 },
] as const;

/** Seconds of focus that make one expedition find. */
export const FIND_SECONDS = 25 * 60;
