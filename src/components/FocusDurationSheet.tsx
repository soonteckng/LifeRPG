import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import TouchableOpacity from "./SheetTouchable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import { Text } from "./AppText";
import { colors, edge } from "../constants/theme";
import { parseDurationFields } from "../utils/sessionSetup";
import SheetTextInput from "./SheetTextInput";

export default function FocusDurationSheet({ seconds, visible, disabled, onClose, onSave }: {
  seconds: number; visible: boolean; disabled: boolean; onClose: () => void; onSave: (seconds: number) => void;
}) {
  const [wasVisible, setWasVisible] = useState(visible);
  const [minutes, setMinutes] = useState(String(Math.floor(seconds / 60)));
  const [remainder, setRemainder] = useState(String(seconds % 60));
  const [error, setError] = useState("");
  const insets = useSafeAreaInsets();
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) { setMinutes(String(Math.floor(seconds / 60))); setRemainder(String(seconds % 60)); setError(""); }
  }
  const save = () => {
    if (disabled) return;
    const next = parseDurationFields(minutes.trim(), remainder.trim());
    if (next === null) { setError("Choose a time from 1 second to 8 hours. Seconds must be between 0 and 59."); return; }
    onSave(next); onClose();
  };
  // Interactive + adjustResize skips the library's keyboard lift on Android.
  // This short editor uses the measured keyboard offset instead of relying on
  // the native modal to resize around a device's numeric keyboard.
  return <AppSheet visible={visible} onRequestClose={onClose} compact keyboardBehavior="interactive" androidKeyboardInputMode="adjustPan" motionMode="timed" label="focus duration"
    header={<SheetHeader title="Length" subtitle="How long would you like this block to run?" onClose={onClose} />}
    footer={<View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 12, backgroundColor: colors.surfaceRaised }}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Use this duration" disabled={disabled} onPress={save} style={p.button}><Text style={p.buttonText}>Use this duration</Text></TouchableOpacity>
    </View>}>
    <BottomSheetScrollView enableFooterMarginAdjustment keyboardShouldPersistTaps="handled" contentContainerStyle={{ ...p.sheetBody, paddingBottom: 16 }}>
      <View style={p.presets}>{[15, 30, 45, 60, 90].map(value => {
        const chosen = minutes.trim() === String(value) && Number(remainder || 0) === 0;
        return <View key={value} style={p.presetCell}><TouchableOpacity disabled={disabled} accessibilityRole="button" accessibilityLabel={`Set duration to ${value} minutes`} accessibilityState={{ selected: chosen }} onPress={() => { setMinutes(String(value)); setRemainder("0"); setError(""); }} style={[p.preset, chosen && p.presetChosen]}><Text style={[p.presetText, chosen && p.presetTextChosen]}>{value}</Text></TouchableOpacity></View>;
      })}</View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1, gap: 8 }}><Text style={p.rowTitle}>Minutes</Text><SheetTextInput accessibilityLabel="Focus minutes" keyboardType="number-pad" value={minutes} onChangeText={value => { setMinutes(value); setError(""); }} maxLength={3} editable={!disabled} style={p.input} /></View>
        <View style={{ flex: 1, gap: 8 }}><Text style={p.rowTitle}>Seconds</Text><SheetTextInput accessibilityLabel="Focus seconds" keyboardType="number-pad" value={remainder} onChangeText={value => { setRemainder(value); setError(""); }} maxLength={2} editable={!disabled} style={p.input} /></View>
      </View>
      <Text style={p.caption}>Up to 8 hours. Your suggestion and category stay the same.</Text>
      {!!error && <Text accessibilityRole="alert" style={p.error}>{error}</Text>}
    </BottomSheetScrollView>
  </AppSheet>;
}

const p = StyleSheet.create({
 presets: { ...edge, flexDirection: "row", gap: 4, padding: 4, borderRadius: 14, backgroundColor: colors.sheetCard }, presetCell: { flex: 1 },
 preset: { minHeight: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" }, presetChosen: { backgroundColor: colors.selection },
 presetText: { color: colors.secondary, fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] }, presetTextChosen: { color: colors.text },
 caption: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
 sheetBody: { paddingHorizontal: 16, gap: 16 }, rowTitle: { color: colors.secondary, fontSize: 14, lineHeight: 20, fontWeight: "500" },
 input: { ...edge, minHeight: 58, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, backgroundColor: colors.sheetCard, color: colors.text, fontSize: 24, fontVariant: ["tabular-nums"] },
 button: { minHeight: 54, padding: 14, borderRadius: 27, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
 buttonText: { color: colors.primaryText, fontSize: 17, lineHeight: 22, fontWeight: "600" }, error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});
