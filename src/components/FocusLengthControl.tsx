import { tapHaptic } from "../utils/tapHaptics";
import { useState } from "react";
import { useUser } from "../context/UserContext";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import FocusDurationSheet from "./FocusDurationSheet";
import { colors, edge } from "../constants/theme";
import { type } from "../constants/typography";
import { durationLabel } from "../utils/sessionSetup";

export default function FocusLengthControl({ seconds, customSeconds, disabled = false, showLabel = true, compact = false, flat = false, onChange, onCustomSave, onCustom }: {
  seconds: number; customSeconds?: number | null; disabled?: boolean; showLabel?: boolean; compact?: boolean; onChange: (seconds: number) => void; onCustomSave?: (seconds: number) => void; onCustom?: () => void;
  /** The compact row inside a grouped card: no divider of its own. */
  flat?: boolean;
}) {
  const [custom, setCustom] = useState(false);
  if (disabled && custom) setCustom(false);
  const { hapticsEnabled } = useUser();
  const feedback = () => { if (hapticsEnabled) tapHaptic(); };
  const customSelected = seconds !== 1800 && seconds !== 3600;
  const open = () => { if (disabled) return; feedback(); if (onCustom) onCustom(); else setCustom(true); };
  return <View style={s.group} testID="focus-length-control">
    {showLabel && <Text style={s.label}>Length</Text>}
    {compact ? <Pressable testID="focus-duration-chip" disabled={disabled} onPress={open} style={[s.chip, flat && s.chipFlat]} accessibilityRole="button" accessibilityLabel={`Change session duration, ${durationLabel(seconds)}`} accessibilityValue={{ text: durationLabel(seconds) }} accessibilityState={{ disabled }}><View style={[s.rowIcon, flat && s.rowIconFlat]}><Ionicons name="time-outline" size={17} color={colors.secondary} /></View><Text style={s.rowLabel}>Length</Text><Text style={s.chipText}>{durationLabel(seconds)}</Text><Ionicons name="chevron-forward" size={15} color={colors.tertiary} /></Pressable> : <View style={s.presets}>
      {[1800, 3600].map(value => <Pressable key={value} onPress={() => { if (disabled || seconds === value) return; feedback(); onChange(value); }} disabled={disabled}
        accessibilityRole="button" accessibilityLabel={`Use ${value / 60} minutes`} accessibilityState={{ selected: seconds === value, disabled }}
        style={[s.option, seconds === value && s.selected]}><Text style={[s.text, seconds === value && s.selectedText]}>{value / 60} min</Text></Pressable>)}
      <Pressable onPress={open} disabled={disabled} accessibilityRole="button" accessibilityLabel="Set a custom focus duration"
        accessibilityState={{ selected: customSelected, disabled }} accessibilityValue={{ text: customSelected ? durationLabel(seconds) : "" }} style={[s.option, customSelected && s.selected]}>
        <Text style={[s.text, customSelected && s.selectedText]}>Custom</Text>
      </Pressable>
    </View>}
    {!onCustom && <FocusDurationSheet seconds={compact ? seconds : customSeconds ?? seconds} visible={custom} disabled={disabled} onClose={() => setCustom(false)} onSave={value => {
      if (compact && (value === 1800 || value === 3600)) onChange(value);
      else (onCustomSave ?? onChange)(value);
    }} />}
  </View>;
}
const s = StyleSheet.create({
  group: { gap: 8 }, label: { ...type.label, paddingHorizontal: 4 },
  presets: { ...edge, flexDirection: "row", flexWrap: "wrap", gap: 6, borderRadius: 14, padding: 3, backgroundColor: colors.sheetCard },
  option: { flex: 1, minWidth: 60, minHeight: 44, paddingHorizontal: 6, paddingVertical: 10, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  selected: { backgroundColor: colors.selection }, text: { color: colors.secondary, fontSize: 15, lineHeight: 20, fontWeight: "500", textAlign: "center" }, selectedText: { color: colors.text },
  chip: { minHeight: 52, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  chipText: { flex: 1, textAlign: "right", color: colors.secondary, fontSize: 16, lineHeight: 22, fontVariant: ["tabular-nums"] },
  rowIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.sheetCard },
  chipFlat: { borderBottomWidth: 0, paddingHorizontal: 14 },
  rowIconFlat: { backgroundColor: colors.accentSoft },
  rowLabel: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "500" },
});
