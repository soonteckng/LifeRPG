import { memo } from "react";
import { StyleSheet, View } from "react-native";
import ItemArt from "../adventurer/ItemArt";
import { rewardItem } from "../../services/rewardCatalog";
import { sceneBox } from "./TrailScenes";

/**
 * Fixed spots in the camp (on the 390 × 844 scene canvas), on open ground
 * either side of the road, clear of the tent, the fire, where you stand and
 * the controls along the bottom. The farthest spot is drawn smaller.
 * `size` is the item's width on the canvas; `y` is where it stands.
 */
export const CAMP_SPOTS = [
  { x: 46, y: 706, size: 56 },
  { x: 320, y: 668, size: 54 },
  { x: 300, y: 748, size: 62 },
  { x: 284, y: 598, size: 42 },
] as const;

/**
 * Up to four decorations you own, newest first: earned ones in the order
 * they arrived, then any others you own (developers own everything).
 */
export function campDecorations(earned: readonly string[], owned: readonly string[]): string[] {
  const decor = (id: string) => rewardItem(id)?.kind === "decor";
  const newest = [...earned].reverse().filter(decor);
  const rest = owned.filter(id => decor(id) && !newest.includes(id));
  return [...new Set([...newest, ...rest])].slice(0, CAMP_SPOTS.length);
}

/**
 * Your decorations in the camp you set off from and walk back to. Brighter in
 * daylight, dim at night, never in the way of the walk.
 */
export default memo(function CampDecorations({ width, height, items, night }: { width: number; height: number; items: readonly string[]; night: boolean }) {
  if (!items.length || width <= 0 || height <= 0) return null;
  const box = sceneBox(width, height);
  return <View style={[StyleSheet.absoluteFill, { opacity: night ? 0.38 : 1 }]} pointerEvents="none" testID="camp-decorations"
    importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
    {items.map((id, i) => {
      const spot = CAMP_SPOTS[i], size = spot.size * box.s, at = box.at(spot.x, spot.y);
      return <View key={id} testID={`camp-decoration-${id}`} style={{ position: "absolute", left: at.left - size / 2, top: at.top - size, width: size, height: size }}>
        <ItemArt id={id} size={size} />
      </View>;
    })}
  </View>;
});
