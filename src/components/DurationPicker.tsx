import * as Haptics from "expo-haptics";
import React, { useMemo, useRef, useState } from "react";
import { Animated, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../constants/theme";
import { useUser } from "../context/UserContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { durationLabel, parseDurationFields, sessionTime, validSessionSeconds } from "../utils/sessionSetup";

type Props = {
  seconds: number; interactive: boolean; revision: number;
  onCommit: (seconds: number) => void; onBusy: (busy: boolean) => void;
  onValidity: (valid: boolean) => void; onEdit: () => void;
};

// One visual grid for setup and countdown. Only the adjacent rows/scroll targets
// change; the selected digits remain mounted at the same coordinates.
export default function DurationPicker(props: Props) {
  return <DurationDisplay {...props} key={props.revision} />;
}

function DurationDisplay({ seconds, interactive, onCommit, onBusy, onValidity, onEdit }: Props) {
  const { width, height, fontScale } = useWindowDimensions();
  const fontSize = Math.min((height < 700 ? 54 : 64) * Math.min(fontScale, 1.25), (width - 64) / 3.7);
  const rowHeight = Math.ceil(fontSize * 1.12);
  const [draft, setDraft] = useState(seconds);
  const draftRef = useRef(seconds);
  const moving = useRef(new Set<string>());
  const shown = interactive ? draft : seconds;
  const minutes = Math.floor(shown / 60);
  const remainder = shown % 60;
  const valid = validSessionSeconds(shown);
  const change = (column: "minutes" | "seconds", value: number, settled: boolean) => {
    const total = column === "minutes" ? value * 60 + draftRef.current % 60 : Math.floor(draftRef.current / 60) * 60 + value;
    draftRef.current = total; setDraft(total);
    const isValid = validSessionSeconds(total);
    onValidity(isValid);
    if (settled) {
      moving.current.delete(column);
      if (moving.current.size === 0) {
        if (isValid) onCommit(total);
        onBusy(false);
      }
    }
  };
  const begin = (column: string) => { moving.current.add(column); onBusy(true); };
  return <View testID="duration-display">
    <View style={styles.labels}><Text style={styles.unit}>Minutes</Text><View style={styles.colonWidth} /><Text style={styles.unit}>Seconds</Text></View>
    <View style={{ height: rowHeight * 3 }}>
      {interactive && <View pointerEvents="none" style={[styles.selectionBand, { top: rowHeight, height: rowHeight }]} />}
      {interactive && <View style={styles.wheels}>
        <Wheel label="Minutes" value={Math.floor(seconds / 60)} maximum={480} rowHeight={rowHeight} fontSize={fontSize}
          onBegin={() => begin("minutes")} onChange={(value, settled) => change("minutes", value, settled)} />
        <View style={styles.colonWidth} />
        <Wheel label="Seconds" value={seconds % 60} maximum={59} rowHeight={rowHeight} fontSize={fontSize}
          onBegin={() => begin("seconds")} onChange={(value, settled) => change("seconds", value, settled)} />
      </View>}
      <View pointerEvents="none" testID="session-countdown" accessible accessibilityLabel={sessionTime(shown)}
        style={[styles.digits, { top: rowHeight, height: rowHeight }]}>
        <Text allowFontScaling={false} style={[styles.digit, { fontSize, lineHeight: rowHeight, opacity: interactive ? 0 : 1 }]}>{String(minutes).padStart(2, "0")}</Text>
        <Text allowFontScaling={false} style={[styles.colon, { fontSize, lineHeight: rowHeight }]}>:</Text>
        <Text allowFontScaling={false} style={[styles.digit, { fontSize, lineHeight: rowHeight, opacity: interactive ? 0 : 1 }]}>{String(remainder).padStart(2, "0")}</Text>
      </View>
    </View>
    <View style={styles.editSlot}>
      {interactive && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Edit duration" onPress={onEdit} style={styles.edit}>
        <Text style={[styles.editText, !valid && styles.error]}>{valid ? "Edit duration" : shown === 0 ? "Choose at least 00:01" : "Maximum is 480:00"}</Text>
      </TouchableOpacity>}
    </View>
  </View>;
}

function Wheel({ label, value, maximum, rowHeight, fontSize, onBegin, onChange }: {
  label: string; value: number; maximum: number; rowHeight: number; fontSize: number;
  onBegin: () => void; onChange: (value: number, settled: boolean) => void;
}) {
  const list = useRef<FlatList<number>>(null);
  const userScroll = useRef(false);
  const dragging = useRef(false);
  const selected = useRef(value);
  const [visible, setVisible] = useState(value);
  const count = maximum + 1;
  const centre = count * 4;
  const [initialValue] = useState(centre + value);
  const [scrollY] = useState(() => new Animated.Value(initialValue * rowHeight));
  const reducedMotion = useReducedMotion();
  const { hapticsEnabled } = useUser();
  const data = useMemo(() => Array.from({ length: count * 9 }, (_, index) => index), [count]);
  const indexAt = (offset: number) => Math.max(0, Math.min(data.length - 1, Math.round(offset / rowHeight)));
  const select = (next: number) => {
    if (next !== selected.current && hapticsEnabled) void Haptics.selectionAsync().catch(() => {});
    selected.current = next;
  };
  const settle = (index: number) => {
    if (!userScroll.current) return;
    userScroll.current = false;
    const next = index % count;
    select(next); setVisible(next); onChange(next, true);
    // Identical neighbours in each cycle make this recenter invisible. It emits
    // no draft change or haptic because programmatic scrolls are ignored.
    if (index < count || index >= count * 8) {
      list.current?.scrollToOffset({ offset: (centre + next) * rowHeight, animated: false });
    }
  };
  const adjust = (delta: number) => {
    const next = (selected.current + delta + count) % count;
    // Accessible adjustments reposition synchronously. Programmatic onScroll
    // events never enter the user-scroll path.
    list.current?.scrollToOffset({ offset: (centre + next) * rowHeight, animated: false });
    userScroll.current = true; onBegin(); settle(next);
  };
  const scrollListener = (event: { nativeEvent: { contentOffset: { y: number } } }) => {
    if (!userScroll.current) return;
    select(indexAt(event.nativeEvent.contentOffset.y) % count);
  };
  // Animated.event registers this listener; it never invokes it during render.
  // eslint-disable-next-line react-hooks/refs
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true, listener: scrollListener });
  return <View style={styles.wheel} accessible accessibilityRole="adjustable" accessibilityLabel={label}
    accessibilityValue={{ min: 0, max: maximum, now: visible }}
    accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
    onAccessibilityAction={(event) => adjust(event.nativeEvent.actionName === "increment" ? 1 : -1)}>
    <Animated.FlatList ref={list} data={data} style={{ height: rowHeight * 3 }}
      accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
      initialScrollIndex={initialValue} initialNumToRender={7} keyExtractor={String}
      getItemLayout={(_, index) => ({ length: rowHeight, offset: index * rowHeight, index })}
      contentContainerStyle={{ paddingVertical: rowHeight }} snapToInterval={rowHeight}
      decelerationRate="fast" showsVerticalScrollIndicator={false} bounces={false}
      windowSize={7} maxToRenderPerBatch={12} removeClippedSubviews={false}
      scrollEventThrottle={1}
      onScrollBeginDrag={() => { dragging.current = true; userScroll.current = true; onBegin(); }}
      onScroll={onScroll}
      onScrollEndDrag={(event) => {
        dragging.current = false;
        const offset = event.nativeEvent.contentOffset.y;
        const next = indexAt(offset);
        // A stationary release at a snap point has no momentum-end event.
        // Otherwise native snapping owns settling and Start remains disabled.
        if (event.nativeEvent.velocity?.y === 0 && Math.abs(offset - next * rowHeight) < 0.5) settle(next);
      }}
      onMomentumScrollEnd={(event) => { if (!dragging.current) settle(indexAt(event.nativeEvent.contentOffset.y)); }}
      renderItem={({ item }) => <View style={[styles.row, { height: rowHeight }]}>
        <Animated.Text allowFontScaling={false} style={[styles.wheelDigit, { fontSize, lineHeight: rowHeight,
          opacity: scrollY.interpolate({ inputRange: [(item - 1) * rowHeight, item * rowHeight, (item + 1) * rowHeight], outputRange: [0.28, 1, 0.28], extrapolate: "clamp" }),
          transform: [{ perspective: 600 },
            { scale: reducedMotion ? 1 : scrollY.interpolate({ inputRange: [(item - 1) * rowHeight, item * rowHeight, (item + 1) * rowHeight], outputRange: [0.68, 1, 0.68], extrapolate: "clamp" }) },
            { rotateX: reducedMotion ? "0deg" : scrollY.interpolate({ inputRange: [(item - 1) * rowHeight, item * rowHeight, (item + 1) * rowHeight], outputRange: ["-42deg", "0deg", "42deg"], extrapolate: "clamp" }) }],
        }]}>{String(item % count).padStart(2, "0")}</Animated.Text>
      </View>} />
  </View>;
}

type EditorProps = { visible: boolean; seconds: number; onCancel: () => void; onConfirm: (seconds: number) => void };
export function DurationEditor({ visible, seconds, onCancel, onConfirm }: EditorProps) {
  const reducedMotion = useReducedMotion();
  const inputRef = useRef<TextInput>(null);
  // Mount one draft per visit; the hidden editor does not retain an abandoned edit.
  return <Modal visible={visible} transparent animationType={reducedMotion ? "none" : "fade"} statusBarTranslucent navigationBarTranslucent={false}
    onShow={() => inputRef.current?.focus()}
    onRequestClose={() => { if (Keyboard.isVisible()) Keyboard.dismiss(); else onCancel(); }}>
    {visible && <EditorDraft inputRef={inputRef} seconds={seconds} onCancel={onCancel} onConfirm={onConfirm} />}
  </Modal>;
}

function EditorDraft({ seconds, onCancel, onConfirm, inputRef }: Omit<EditorProps, "visible"> & { inputRef: React.RefObject<TextInput | null> }) {
  const [minutesText, setMinutesText] = useState(String(Math.floor(seconds / 60)));
  const [secondsText, setSecondsText] = useState(String(seconds % 60).padStart(2, "0"));
  const insets = useSafeAreaInsets();
  const total = parseDurationFields(minutesText, secondsText);
  return <KeyboardAvoidingView style={styles.editorRoot} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <SafeAreaView edges={["top"]} style={styles.editorSafe}>
      <View style={[styles.editorCard, { paddingBottom: Math.max(12, insets.bottom) }]} accessibilityViewIsModal>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.editorBody} style={styles.editorScroll}>
          <Text style={styles.title}>Set duration</Text>
          <View style={styles.fields}>
            <View style={styles.field}><Text style={styles.fieldLabel}>Minutes</Text><TextInput ref={inputRef} selectTextOnFocus
              accessibilityLabel="Duration minutes" value={minutesText} onChangeText={setMinutesText} keyboardType="number-pad"
              style={styles.input} /></View>
            <View style={styles.field}><Text style={styles.fieldLabel}>Seconds</Text><TextInput selectTextOnFocus
              accessibilityLabel="Duration seconds" value={secondsText} onChangeText={setSecondsText} keyboardType="number-pad"
              style={styles.input} /></View>
          </View>
          <Text accessibilityLiveRegion="polite" style={[styles.hint, total === null && styles.error]}>
            {total === null ? "Enter 00:01–480:00. Seconds must be 00–59; both fields are required." : durationLabel(total)}
          </Text>
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity accessibilityRole="button" onPress={() => { Keyboard.dismiss(); onCancel(); }} style={styles.button}><Text style={styles.editText}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: total === null }} disabled={total === null}
            onPress={() => { if (total !== null) { Keyboard.dismiss(); onConfirm(total); } }} style={[styles.button, styles.primary, total === null && styles.disabled]}>
            <Text style={styles.primaryText}>Set duration</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  labels: { flexDirection: "row", alignItems: "center" }, unit: { flex: 1, textAlign: "center", color: colors.secondary, fontSize: 13 },
  wheels: { flexDirection: "row" }, wheel: { flex: 1 }, colonWidth: { width: 22 },
  selectionBand: { position: "absolute", left: 4, right: 4, borderRadius: 18, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.line },
  row: { alignItems: "center", justifyContent: "center" }, adjacent: { color: colors.muted, fontVariant: ["tabular-nums"] },
  wheelDigit: { color: colors.text, textAlign: "center", fontWeight: "500", fontVariant: ["tabular-nums"] },
  digits: { position: "absolute", left: 0, right: 0, flexDirection: "row", alignItems: "center" },
  digit: { flex: 1, textAlign: "center", color: colors.text, fontWeight: "500", fontVariant: ["tabular-nums"] },
  colon: { width: 22, textAlign: "center", color: colors.text, fontWeight: "300" },
  editSlot: { minHeight: 44, justifyContent: "center" }, edit: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  editText: { color: colors.accent, fontSize: 15, fontWeight: "500" }, error: { color: colors.danger },
  editorRoot: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }, editorSafe: { flex: 1, justifyContent: "flex-end" },
  editorCard: { maxHeight: "100%", backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  editorScroll: { flexGrow: 0, flexShrink: 1 }, editorBody: { padding: 24, gap: 16 },
  title: { color: colors.text, fontSize: 21, fontWeight: "600" }, fields: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  field: { flex: 1, minWidth: 100, gap: 8 }, fieldLabel: { color: colors.secondary, fontSize: 15 },
  input: { color: colors.text, backgroundColor: colors.background, borderRadius: 12, padding: 12, minHeight: 52, fontSize: 24, fontVariant: ["tabular-nums"] },
  hint: { color: colors.secondary, fontSize: 14 }, footer: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 24, gap: 12 },
  button: { flexGrow: 1, minHeight: 48, padding: 14, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  primary: { backgroundColor: colors.accent }, primaryText: { color: colors.background, fontSize: 16, fontWeight: "600" }, disabled: { opacity: 0.45 },
});
