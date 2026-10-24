// The person's own look: skin, hair and glasses. Everyone gets every option
// for free. Colours are shared by the drawing and the pickers.

export interface AdventurerLook { skin: string; hair: string; hairColor: string; glasses: boolean }

export const DEFAULT_LOOK: AdventurerLook = { skin: "3", hair: "short", hairColor: "darkbrown", glasses: false };

export const SKIN_TONES = ["#FBE3D0", "#F3CFB0", "#E8B996", "#D49E78", "#B9805A", "#9A6343", "#7A4A30", "#5A3523"] as const;

export const HAIR_STYLES = [
  { id: "short", name: "Short" },
  { id: "long", name: "Long" },
  { id: "coily", name: "Coily" },
  { id: "braids", name: "Braids" },
  { id: "bun", name: "Bun" },
] as const;

export const HAIR_COLORS = [
  { id: "black", name: "Black", color: "#1E1B22" },
  { id: "darkbrown", name: "Dark brown", color: "#3D2A1F" },
  { id: "brown", name: "Brown", color: "#6B4A32" },
  { id: "auburn", name: "Auburn", color: "#8A3B24" },
  { id: "blonde", name: "Blonde", color: "#C99A55" },
] as const;

export const skinColor = (skin: string) => SKIN_TONES[Math.min(8, Math.max(1, Number.parseInt(skin, 10) || 3)) - 1];
export const hairColor = (id: string) => HAIR_COLORS.find(h => h.id === id)?.color ?? HAIR_COLORS[1].color;

/** A look the app can draw: anything unknown falls back to the default. */
export function normalizeLook(value: Partial<AdventurerLook> | null | undefined): AdventurerLook {
  return {
    skin: typeof value?.skin === "string" && /^[1-8]$/.test(value.skin) ? value.skin : DEFAULT_LOOK.skin,
    hair: HAIR_STYLES.some(h => h.id === value?.hair) ? value!.hair! : DEFAULT_LOOK.hair,
    hairColor: HAIR_COLORS.some(h => h.id === value?.hairColor) ? value!.hairColor! : DEFAULT_LOOK.hairColor,
    glasses: value?.glasses === true,
  };
}

export function darken(hex: string, factor: number) {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor))).toString(16).padStart(2, "0");
  return `#${c(16)}${c(8)}${c(0)}`;
}

// Level tier colours, matching src/utils/levelTiers.ts.
const TIER_COLORS: [number, string][] = [[1, "#AAB3FF"], [3, "#79BFF2"], [6, "#6DD4B5"], [10, "#F4AA88"], [15, "#C1A8FA"], [21, "#E98ABC"],
  [28, "#91CFDF"], [36, "#D6BAF5"], [45, "#86CDBD"], [55, "#9DBBEE"], [70, "#D6B98A"], [100, "#BFA9F0"]];
export function tierColor(level: number) {
  let color = TIER_COLORS[0][1];
  for (const [from, c] of TIER_COLORS) if (level >= from) color = c;
  return color;
}

/**
 * Your level's colours: the colour of your tier on the level road, used for
 * the level on your picture, Home, Profile and the road itself.
 */
export function levelColors(level: number) {
  const color = tierColor(level);
  return { color, soft: `${color}29`, track: `${color}3D`, ink: "#131826" };
}

/** The camp lantern grows with level: iron, then silver with a gem, brass, pale gold. */
export function levelLanternColors(level: number) {
  if (!(level > 0)) return null;
  const metal = level >= 55 ? ["#F3E3AE", "#B8994E"] : level >= 21 ? ["#D6A84A", "#8F6A22"] : level >= 3 ? ["#D3DAE5", "#8E98A8"] : ["#7A7F8C", "#4A4E58"];
  return { flame: tierColor(level), frame: metal[0], frameDark: metal[1], gem: level >= 3 };
}
