import TouchableOpacity from "./MotionPressable";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { timerLayout } from "../utils/timerLayout";
import { Text } from "./AppText";
import * as Haptics from "expo-haptics";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Animated, FlatList, PixelRatio, StyleSheet, View, useWindowDimensions } from "react-native";
import { BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../constants/theme";
import { useUser } from "../context/UserContext";
import { durationLabel, parseDurationFields, sessionTime, validSessionSeconds } from "../utils/sessionSetup";

type Props = {
  seconds: number; interactive: boolean; revision: number; compact?: boolean; caption?: string;
  onCommit: (seconds: number) => void; onBusy: (busy: boolean) => void;
  onValidity: (valid: boolean) => void; onEdit: () => void;
};

// One visual grid for setup and countdown. Only the adjacent rows/scroll targets
// change; the selected digits remain mounted at the same coordinates.
export default function DurationPicker(props: Props) {
  return <DurationDisplay {...props} key={props.revision} />;
}

function DurationDisplay({ seconds, interactive, onCommit, onBusy, onValidity, onEdit, compact = false, caption }: Props) {
  const { width, height, fontScale } = useWindowDimensions();
  const geometry = timerLayout(width, height, fontScale, compact);
  const { fontSize, labelHeight } = geometry;
  // Native cells are measured in physical pixels. A fractional pixel stride
  // compounds over the virtualized looping list and shifts the two columns
  // differently. Use the same pixel-aligned stride for cells, frames and snaps.
  const rowHeight = interactive ? PixelRatio.roundToNearestPixel(geometry.rowHeight) : geometry.rowHeight;
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
    <View style={[styles.labels, { height: labelHeight }, compact && !interactive && { opacity: 0 }]}><Text style={styles.unit} maxFontSizeMultiplier={1.4}>Minutes</Text><View style={styles.colonWidth} /><Text style={styles.unit} maxFontSizeMultiplier={1.4}>Seconds</Text></View>
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
        <Text allowFontScaling={false} style={[styles.digit, { fontSize, height: rowHeight, lineHeight: rowHeight, opacity: 0 }]}>{String(minutes).padStart(2, "0")}</Text>
        <Text allowFontScaling={false} style={[styles.colon, { fontSize, height: rowHeight, lineHeight: rowHeight, opacity: interactive ? 1 : 0 }]}>:</Text>
        <Text allowFontScaling={false} style={[styles.digit, { fontSize, height: rowHeight, lineHeight: rowHeight, opacity: 0 }]}>{String(remainder).padStart(2, "0")}</Text>
        <Text allowFontScaling={false} style={{ position: "absolute", width: "100%", height: rowHeight, lineHeight: rowHeight, includeFontPadding: false, textAlignVertical: "center", textAlign: "center", fontVariant: ["tabular-nums"], color: colors.text, fontSize, fontWeight: "500", opacity: interactive ? 0 : 1 }}>{sessionTime(shown)}</Text>
      </View>
    </View>
    {compact && !interactive && caption && <Text style={{ position: "absolute", top: labelHeight + rowHeight * 2 + 8, width: "100%", textAlign: "center", color: colors.secondary, fontSize: 15 }}>{caption}</Text>}
    <View style={styles.editSlot}>
      {interactive && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Edit duration" onPress={onEdit} style={styles.edit}>
        <Text style={[styles.wheelHint, !valid && styles.error]}>{valid ? compact ? "Scroll or tap here to set duration" : "Edit duration" : shown === 0 ? "Choose at least 00:01" : "Maximum is 480:00"}</Text>
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
  const settle = (index: number, offset = index * rowHeight) => {
    if (!userScroll.current) return;
    userScroll.current = false;
    const next = index % count;
    select(next); setVisible(next); onChange(next, true);
    // Identical neighbours in each cycle make this recenter invisible. It emits
    // no draft change or haptic because programmatic scrolls are ignored.
    const targetOffset = (index < count || index >= count * 8 ? centre + next : index) * rowHeight;
    // Some native fling endings stop just off the snap boundary. Correct only
    // that residual offset; an already aligned fling never gets another scroll.
    if (Math.abs(offset - targetOffset) > 0.5 / PixelRatio.get()) {
      list.current?.scrollToOffset({ offset: targetOffset, animated: false });
    }
  };
  const adjust = (delta: number) => {
    const next = (selected.current + delta + count) % count;
    // Accessible adjustments reposition synchronously. Programmatic onScroll
    // events never enter the user-scroll path.
    list.current?.scrollToOffset({ offset: (centre + next) * rowHeight, animated: false });
    userScroll.current = true; onBegin(); settle(centre + next);
  };
  const scrollListener = (event: { nativeEvent: { contentOffset: { y: number } } }) => {
    if (!userScroll.current) return;
    select(indexAt(event.nativeEvent.contentOffset.y) % count);
  };
  // Animated.event registers this listener; it never invokes it during render.
  /* eslint-disable react-hooks/refs -- Animated.event registers the listener without calling it. */
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true, listener: scrollListener });
  /* eslint-enable react-hooks/refs */
  return <View style={styles.wheel} accessible accessibilityRole="adjustable" accessibilityLabel={label}
    accessibilityValue={{ min: 0, max: maximum, now: visible }}
    accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
    onAccessibilityAction={(event) => adjust(event.nativeEvent.actionName === "increment" ? 1 : -1)}>
    <Animated.FlatList ref={list} data={data} style={{ height: rowHeight * 3 }}
      accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
      automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never"
      initialScrollIndex={initialValue - 1} initialNumToRender={7} keyExtractor={String}
      getItemLayout={(_, index) => ({ length: rowHeight, offset: (index + 1) * rowHeight, index })}
      ListHeaderComponent={<View style={{ height: rowHeight }} />}
      ListFooterComponent={<View style={{ height: rowHeight }} />}
      snapToInterval={rowHeight} snapToAlignment="start"
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
        if (event.nativeEvent.velocity?.y === 0 && Math.abs(offset - next * rowHeight) < 0.5) settle(next, offset);
      }}
      onMomentumScrollEnd={(event) => { if (!dragging.current) settle(indexAt(event.nativeEvent.contentOffset.y), event.nativeEvent.contentOffset.y); }}
      renderItem={({ item }) => <View style={[styles.row, { height: rowHeight }]}>
        <Animated.Text allowFontScaling={false} style={[styles.wheelDigit, { fontSize, height: rowHeight, lineHeight: rowHeight,
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
  const [mounted, setMounted] = useState(visible);
  const latestVisible = useRef(visible);
  useLayoutEffect(() => { latestVisible.current = visible; }, [visible]);
  const [previousVisible, setPreviousVisible] = useState(visible);
  if (previousVisible !== visible) {
    setPreviousVisible(visible);
    if (visible) setMounted(true);
  }
  if (!mounted) return null;
  return <AppSheet visible={visible} onRequestClose={onCancel}
    onDismiss={() => { if (!latestVisible.current) setMounted(false); }} label="Set duration" header={<View style={styles.pickerHeader}><Text style={styles.title}>Set duration</Text></View>}>
    <EditorDraft seconds={seconds} onCancel={onCancel} onConfirm={onConfirm} />
  </AppSheet>;
}

function EditorDraft({ seconds, onCancel, onConfirm }: Omit<EditorProps, "visible">) {
  const [minutesText, setMinutesText] = useState(String(Math.floor(seconds / 60)));
  const [secondsText, setSecondsText] = useState(String(seconds % 60).padStart(2, "0"));
  const insets = useSafeAreaInsets();
  const total = parseDurationFields(minutesText, secondsText);
  return <>
    <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.editorBody}>
      <View style={styles.fields}>
        <View style={styles.field}><Text style={styles.fieldLabel}>Minutes</Text><BottomSheetTextInput selectTextOnFocus
          accessibilityLabel="Duration minutes" value={minutesText} onChangeText={setMinutesText} keyboardType="number-pad"
          style={styles.input} /></View>
        <View style={styles.field}><Text style={styles.fieldLabel}>Seconds</Text><BottomSheetTextInput selectTextOnFocus
          accessibilityLabel="Duration seconds" value={secondsText} onChangeText={setSecondsText} keyboardType="number-pad"
          style={styles.input} /></View>
      </View>
      <Text accessibilityLiveRegion="polite" style={[styles.hint, total === null && styles.error]}>
        {total === null ? "Enter 00:01–480:00. Seconds must be 00–59; both fields are required." : durationLabel(total)}
      </Text>
    </BottomSheetScrollView>
    <View style={[styles.footer, { paddingBottom: Math.max(12, insets.bottom) }]}>
      <TouchableOpacity accessibilityRole="button" onPress={onCancel} style={styles.button}><Text style={styles.editText}>Cancel</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: total === null }} disabled={total === null}
        onPress={() => { if (total !== null) onConfirm(total); }} style={[styles.button, styles.primary, total === null && styles.disabled]}>
        <Text style={styles.primaryText}>Set duration</Text>
      </TouchableOpacity>
    </View>
  </>;
}

const styles = StyleSheet.create({
  labels: { flexDirection: "row", alignItems: "center" }, unit: { flex: 1, textAlign: "center", color: colors.secondary, fontSize: 15 },
  wheels: { flexDirection: "row" }, wheel: { flex: 1 }, colonWidth: { width: 22 },
  selectionBand: { position: "absolute", left: 0, right: 0, borderRadius: 18, backgroundColor: colors.accentSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  row: { alignItems: "center", justifyContent: "center" }, adjacent: { color: colors.muted, fontVariant: ["tabular-nums"] },
  wheelDigit: { width: "100%", includeFontPadding: false, textAlignVertical: "center", color: colors.text, textAlign: "center", fontWeight: "500", fontVariant: ["tabular-nums"] },
  digits: { position: "absolute", left: 0, right: 0, flexDirection: "row", alignItems: "center" },
  digit: { flex: 1, includeFontPadding: false, textAlignVertical: "center", textAlign: "center", color: colors.text, fontWeight: "500", fontVariant: ["tabular-nums"] },
  colon: { width: 22, includeFontPadding: false, textAlignVertical: "center", textAlign: "center", color: colors.text, fontWeight: "300" },
  editSlot: { minHeight: 44, justifyContent: "center" }, edit: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  wheelHint: { color: colors.secondary, fontSize: 14, lineHeight: 20, fontWeight: "400" },
  editText: { color: colors.accent, fontSize: 15, fontWeight: "500" }, error: { color: colors.danger },
  pickerHeader: { paddingHorizontal: 24, paddingBottom: 8 },
  editorBody: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 20, gap: 16 },
  footer: { flexDirection: "row", gap: 12, paddingHorizontal: 24, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  button: { flex: 1, minHeight: 48, justifyContent: "center", alignItems: "center", borderRadius: 14, backgroundColor: colors.background },
  primary: { backgroundColor: colors.accent }, disabled: { opacity: 0.45 }, primaryText: { color: colors.background, fontSize: 15, fontWeight: "500" },
  title: { color: colors.text, fontSize: 21, fontWeight: "500" }, fields: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  field: { flex: 1, minWidth: 100, gap: 8 }, fieldLabel: { color: colors.secondary, fontSize: 15 },
  input: { color: colors.text, backgroundColor: colors.background, borderRadius: 12, padding: 12, minHeight: 52, fontSize: 24, fontVariant: ["tabular-nums"] },
  hint: { color: colors.secondary, fontSize: 14 },
});
