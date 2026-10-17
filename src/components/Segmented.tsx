import type { ComponentType, ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import MotionPressable from "./MotionPressable";
import SlidingSelection from "./SlidingSelection";
import { colors } from "../constants/theme";

type Option<T extends string> = { value: T; label: string; accessibilityLabel?: string };
type Touchable = ComponentType<{ onPress?: () => void; disabled?: boolean; style?: unknown; accessibilityRole?: "radio"; accessibilityLabel?: string; accessibilityState?: object; children?: ReactNode }>;

// An iOS-style segmented control: a sliding thumb behind equal labels.
// Sheets pass their own touchable so taps cooperate with the sheet's drag.
export default function Segmented<T extends string>({ options, value, onChange, disabled = false, Touchable = MotionPressable as Touchable, track = colors.sheetCard }: {
  options: Option<T>[]; value: T; onChange: (value: T) => void; disabled?: boolean; Touchable?: Touchable; track?: string;
}) {
  const index = Math.max(0, options.findIndex(option => option.value === value));
  return <View style={[s.track, { backgroundColor: track }]} accessibilityRole="radiogroup">
    <View pointerEvents="none" style={s.thumbLane}><SlidingSelection index={index} count={options.length} settling="quick" style={[s.thumb, { width: `${100 / options.length}%` }]} /></View>
    {options.map(option => {
      const selected = option.value === value;
      return <View key={option.value} style={s.cell}>
        <Touchable disabled={disabled} onPress={() => { if (!selected) onChange(option.value); }} accessibilityRole="radio"
          accessibilityLabel={option.accessibilityLabel ?? option.label} accessibilityState={{ selected, checked: selected, disabled }} style={s.option}>
          <Text style={[s.label, selected && s.selected]} numberOfLines={1}>{option.label}</Text>
        </Touchable>
      </View>;
    })}
  </View>;
}
const s = StyleSheet.create({
  track: { flexDirection: "row", padding: 3, borderRadius: 12, minHeight: 40 },
  thumbLane: { position: "absolute", top: 3, bottom: 3, left: 3, right: 3 },
  thumb: { position: "absolute", top: 0, bottom: 0, borderRadius: 9, backgroundColor: colors.selection },
  cell: { flex: 1 },
  option: { minHeight: 34, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  label: { color: colors.secondary, fontSize: 14, lineHeight: 18, fontWeight: "600" },
  selected: { color: colors.text },
});
