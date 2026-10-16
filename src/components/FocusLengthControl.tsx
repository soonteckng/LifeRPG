import { useState } from "react";
import * as Haptics from "expo-haptics";
import { useUser } from "../context/UserContext";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import FocusDurationSheet from "./FocusDurationSheet";
import { colors } from "../constants/theme";
import { durationLabel } from "../utils/sessionSetup";

export default function FocusLengthControl({ seconds, customSeconds, disabled = false, showLabel = true, compact = false, onChange, onCustomSave, onCustom }: {
  seconds: number; customSeconds?: number | null; disabled?: boolean; showLabel?: boolean; compact?: boolean; onChange: (seconds: number) => void; onCustomSave?: (seconds: number) => void; onCustom?: () => void;
}) {
  const [custom, setCustom] = useState(false);
  if (disabled && custom) setCustom(false);
  const { hapticsEnabled } = useUser();
  const feedback = () => { if (hapticsEnabled) void Haptics.selectionAsync().catch(() => {}); };
  const customSelected = seconds !== 1800 && seconds !== 3600;
  const open = () => { if (disabled) return; feedback(); if (onCustom) onCustom(); else setCustom(true); };
  return <View style={s.group} testID="focus-length-control">
    {showLabel && <Text style={s.label}>Focus length</Text>}
    {compact ? <Pressable testID="focus-duration-chip" disabled={disabled} onPress={open} style={s.chip} accessibilityRole="button" accessibilityLabel={`Change session duration, ${durationLabel(seconds)}`} accessibilityValue={{ text: durationLabel(seconds) }} accessibilityState={{ disabled }}><Ionicons name="time-outline" size={15} color={colors.accent} /><Text style={s.chipText}>{durationLabel(seconds)}</Text><Ionicons name="chevron-down" size={12} color={colors.secondary} /></Pressable> : <View style={s.presets}>
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
  group: { gap: 8 }, label: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 6, borderRadius: 14, padding: 3, backgroundColor: "rgba(255,255,255,0.05)" },
  option: { flex: 1, minWidth: 60, minHeight: 44, paddingHorizontal: 6, paddingVertical: 10, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  selected: { backgroundColor: colors.selection }, text: { color: colors.secondary, fontSize: 15, lineHeight: 21, fontWeight: "500", textAlign: "center" }, selectedText: { color: colors.text },
  chip: { minHeight: 44, flexShrink: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12, borderRadius: 18, backgroundColor: "rgba(170,179,255,0.12)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(170,179,255,0.22)" },
  chipText: { color: colors.accent, fontSize: 15, lineHeight: 20, fontWeight: "600", fontVariant: ["tabular-nums"] },
});
