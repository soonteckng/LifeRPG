import { useState } from "react";
import * as Haptics from "expo-haptics";
import { useUser } from "../context/UserContext";
import { StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import FocusDurationSheet from "./FocusDurationSheet";
import { colors } from "../constants/theme";
import { durationLabel } from "../utils/sessionSetup";

export default function FocusLengthControl({ seconds, disabled = false, onChange, onCustom }: {
  seconds: number; disabled?: boolean; onChange: (seconds: number) => void; onCustom?: () => void;
}) {
  const [custom, setCustom] = useState(false);
  const { hapticsEnabled } = useUser();
  const feedback = () => { if (hapticsEnabled) void Haptics.selectionAsync().catch(() => {}); };
  const customSelected = seconds !== 1800 && seconds !== 3600;
  return <View style={s.group} testID="focus-length-control">
    <Text style={s.label}>Focus length</Text>
    <View style={s.presets}>
      {[1800, 3600].map(value => <Pressable key={value} onPress={() => { if (disabled || seconds === value) return; feedback(); onChange(value); }} disabled={disabled}
        accessibilityRole="button" accessibilityLabel={`Use ${value / 60} minutes`} accessibilityState={{ selected: seconds === value, disabled }}
        style={[s.option, seconds === value && s.selected]}><Text style={[s.text, seconds === value && s.selectedText]}>{value / 60} min</Text></Pressable>)}
      <Pressable onPress={() => { if (disabled) return; feedback(); if (onCustom) onCustom(); else setCustom(true); }} disabled={disabled} accessibilityRole="button" accessibilityLabel="Set a custom focus duration"
        accessibilityState={{ selected: customSelected, disabled }} style={[s.option, customSelected && s.selected]}>
        <Text style={[s.text, customSelected && s.selectedText]}>{customSelected ? durationLabel(seconds) : "Custom"}</Text>
      </Pressable>
    </View>
    {!onCustom && <FocusDurationSheet seconds={seconds} visible={custom} disabled={disabled} onClose={() => setCustom(false)} onSave={onChange} />}
  </View>;
}
const s = StyleSheet.create({
  group: { gap: 8 }, label: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 6, borderRadius: 14, padding: 3, backgroundColor: "rgba(255,255,255,0.05)" },
  option: { flex: 1, minWidth: 60, minHeight: 44, paddingHorizontal: 6, paddingVertical: 10, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  selected: { backgroundColor: colors.selection }, text: { color: colors.secondary, fontSize: 15, lineHeight: 21, fontWeight: "500", textAlign: "center" }, selectedText: { color: colors.text },
});
