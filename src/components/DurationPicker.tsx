import { BottomSheetScrollView, TouchableOpacity } from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import React, { useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { FlatList, NativeViewGestureHandler } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../constants/theme";
import { useUser } from "../context/UserContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { durationLabel, validSessionSeconds } from "../utils/sessionSetup";
import AppSheet from "./AppSheet";

type Props = { visible: boolean; seconds: number; onCancel: () => void; onConfirm: (seconds: number) => void };

export default function DurationPicker({ visible, seconds, onCancel, onConfirm }: Props) {
  const [wasVisible, setWasVisible] = useState(false);
  const [draft, setDraft] = useState(seconds);
  const [visit, setVisit] = useState(0);
  const [footerHeight, setFooterHeight] = useState(90);
  const insets = useSafeAreaInsets();
  // Reset only on opening. Neither wheel scrolling nor sheet dismissal changes setup.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) { setDraft(seconds); setVisit(visit + 1); }
  }
  const valid = validSessionSeconds(draft);
  return <AppSheet visible={visible} onRequestClose={onCancel} label="duration picker"
    header={<Text style={styles.title}>Custom duration</Text>}
    footer={<View onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)} style={[styles.footer, { paddingBottom: Math.max(12, insets.bottom) }]}>
      <TouchableOpacity accessibilityRole="button" onPress={onCancel} style={styles.button}><Text style={styles.buttonText}>Cancel</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !valid }} disabled={!valid}
        onPress={() => { if (valid) onConfirm(draft); }} style={[styles.button, styles.primary, !valid && styles.disabled]}>
        <Text style={styles.primaryText}>Set duration</Text>
      </TouchableOpacity>
    </View>}>
    <BottomSheetScrollView contentContainerStyle={[styles.body, { paddingBottom: footerHeight + 16 }]}>
      <View style={styles.columns} key={visit}>
        <Wheel label="Minutes" maximum={480} value={Math.floor(draft / 60)} onChange={(value) => setDraft((previous) => value * 60 + previous % 60)} />
        <Wheel label="Seconds" maximum={59} value={draft % 60} onChange={(value) => setDraft((previous) => Math.floor(previous / 60) * 60 + value)} />
      </View>
      <Text style={[styles.preview, !valid && styles.error]} accessibilityLiveRegion="polite">
        {valid ? durationLabel(draft) : draft === 0 ? "Choose at least 1 second." : "Maximum duration is 480 min 00 sec."}
      </Text>
    </BottomSheetScrollView>
  </AppSheet>;
}

function Wheel({ label, maximum, value, onChange }: { label: string; maximum: number; value: number; onChange: (value: number) => void }) {
  const { fontScale } = useWindowDimensions();
  const rowHeight = Math.max(48, Math.ceil(32 * fontScale));
  const list = useRef<FlatList<number>>(null);
  const lastHaptic = useRef(value);
  const [initialValue] = useState(value);
  const { hapticsEnabled } = useUser();
  const reducedMotion = useReducedMotion();
  const data = useMemo(() => Array.from({ length: maximum + 1 }, (_, index) => index), [maximum]);
  const indexAt = (offset: number) => Math.max(0, Math.min(maximum, Math.round(offset / rowHeight)));
  const feedback = (next: number) => {
    if (next !== lastHaptic.current && hapticsEnabled) void Haptics.selectionAsync().catch(() => {});
    lastHaptic.current = next;
  };
  const adjust = (delta: number) => {
    const next = Math.max(0, Math.min(maximum, value + delta));
    list.current?.scrollToOffset({ offset: next * rowHeight, animated: !reducedMotion });
    onChange(next); feedback(next);
  };
  return <View style={styles.column}>
    <Text style={styles.label}>{label}</Text>
    <View accessible accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: maximum, now: value }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) => adjust(event.nativeEvent.actionName === "increment" ? 1 : -1)}>
      <View pointerEvents="none" style={[styles.selection, { top: rowHeight, height: rowHeight }]} />
      <NativeViewGestureHandler disallowInterruption>
        <FlatList ref={list} data={data} extraData={value} style={{ height: rowHeight * 3 }}
          accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
          keyExtractor={(item) => String(item)} initialScrollIndex={initialValue} initialNumToRender={7}
          getItemLayout={(_, index) => ({ length: rowHeight, offset: index * rowHeight, index })}
          contentContainerStyle={{ paddingVertical: rowHeight }}
          snapToInterval={rowHeight} decelerationRate="fast" showsVerticalScrollIndicator={false} bounces={false}
          scrollEventThrottle={16} onScroll={(event) => onChange(indexAt(event.nativeEvent.contentOffset.y))}
          onMomentumScrollEnd={(event) => feedback(indexAt(event.nativeEvent.contentOffset.y))}
          renderItem={({ item }) => <View style={[styles.row, { height: rowHeight }]}><Text style={[styles.number, item === value && styles.selectedNumber]}>{String(item).padStart(2, "0")}</Text></View>} />
      </NativeViewGestureHandler>
    </View>
    <View style={styles.adjustments}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Decrease ${label.toLowerCase()}`} disabled={value === 0} onPress={() => adjust(-1)} style={styles.adjust}><Text style={styles.buttonText}>−</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Increase ${label.toLowerCase()}`} disabled={value === maximum} onPress={() => adjust(1)} style={styles.adjust}><Text style={styles.buttonText}>+</Text></TouchableOpacity>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 21, fontWeight: "600", paddingHorizontal: 24, paddingBottom: 16 },
  body: { paddingHorizontal: 24 }, columns: { flexDirection: "row", gap: 20 }, column: { flex: 1, minWidth: 0 },
  label: { color: colors.secondary, fontSize: 15, textAlign: "center", marginBottom: 8 },
  row: { alignItems: "center", justifyContent: "center" }, number: { fontSize: 24, color: colors.secondary, fontVariant: ["tabular-nums"] },
  selectedNumber: { color: colors.accent, fontWeight: "600" }, selection: { position: "absolute", left: 0, right: 0, borderRadius: 12, backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 1 },
  adjustments: { flexDirection: "row", justifyContent: "space-around", marginTop: 8 }, adjust: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  preview: { color: colors.text, fontSize: 15, textAlign: "center", marginTop: 12 }, error: { color: colors.danger },
  footer: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 24, paddingTop: 12, gap: 12, backgroundColor: colors.surface },
  button: { flexGrow: 1, minHeight: 48, padding: 14, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  buttonText: { color: colors.accent, fontSize: 16, fontWeight: "500" }, primary: { backgroundColor: colors.accent }, primaryText: { color: colors.background, fontSize: 16, fontWeight: "600" }, disabled: { opacity: 0.45 },
});
