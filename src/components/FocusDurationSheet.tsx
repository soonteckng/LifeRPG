import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetScrollView, BottomSheetTextInput, TouchableOpacity } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import { Text } from "./AppText";
import { colors } from "../constants/theme";
import { parseDurationFields } from "../utils/sessionSetup";

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
  return <AppSheet visible={visible} onRequestClose={onClose} compact keyboardBehavior="fillParent" motionMode="timed" label="focus duration"
    header={<View style={p.sheetHeader}><Text style={p.title}>Make time for focus</Text><Text style={p.body}>Choose a duration for this block.</Text></View>}
    footer={<View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 12, backgroundColor: colors.surface }}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Use this duration" disabled={disabled} onPress={save} style={p.button}><Text style={p.buttonText}>Use this duration</Text></TouchableOpacity>
    </View>}>
    <BottomSheetScrollView enableFooterMarginAdjustment keyboardShouldPersistTaps="handled" contentContainerStyle={[p.sheetBody, { paddingBottom: 16 }]}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1, gap: 8 }}><Text style={p.rowTitle}>Minutes</Text><BottomSheetTextInput accessibilityLabel="Focus minutes" keyboardType="number-pad" value={minutes} onChangeText={value => { setMinutes(value); setError(""); }} maxLength={3} editable={!disabled} style={p.input} /></View>
        <View style={{ flex: 1, gap: 8 }}><Text style={p.rowTitle}>Seconds</Text><BottomSheetTextInput accessibilityLabel="Focus seconds" keyboardType="number-pad" value={remainder} onChangeText={value => { setRemainder(value); setError(""); }} maxLength={2} editable={!disabled} style={p.input} /></View>
      </View>
      <Text style={p.caption}>Up to 8 hours. Your suggestion and Life area stay the same.</Text>
      {!!error && <Text accessibilityRole="alert" style={p.error}>{error}</Text>}
    </BottomSheetScrollView>
  </AppSheet>;
}

const p = StyleSheet.create({
 sheetHeader: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 }, title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "500" },
 body: { color: colors.secondary, fontSize: 16, lineHeight: 23 }, caption: { color: colors.secondary, fontSize: 14, lineHeight: 21 },
 sheetBody: { paddingHorizontal: 20, gap: 12 }, rowTitle: { color: colors.text, fontSize: 16, lineHeight: 22 },
 input: { minHeight: 52, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.line, color: colors.text, fontSize: 20 },
 button: { minHeight: 52, padding: 14, borderRadius: 16, backgroundColor: "#E5E4FF", alignItems: "center", justifyContent: "center" },
 buttonText: { color: "#171827", fontSize: 17, lineHeight: 23, fontWeight: "500" }, error: { color: colors.danger, fontSize: 14, lineHeight: 21 },
});
