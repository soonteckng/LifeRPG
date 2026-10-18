import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { Text } from "./AppText";
import { colors, edge, radius } from "../constants/theme";
import { tapHaptic, tapHapticsEnabled } from "../utils/tapHaptics";
import type { HomeSection } from "../services/appPreferences";

const ROW = 68, GAP = 8, STEP = ROW + GAP;
export const HOME_SECTION_INFO: Record<HomeSection, { title: string; caption: string; icon: React.ComponentProps<typeof Ionicons>["name"]; tint: string }> = {
  routines: { title: "My Routines", caption: "Start one with a tap", icon: "repeat", tint: "#BF5AF2" },
  exams: { title: "Upcoming Exams", caption: "What’s coming this week", icon: "calendar-outline", tint: "#FF6961" },
  squad: { title: "My Squad", caption: "Your week together", icon: "people-outline", tint: "#63E6BE" },
  week: { title: "This Week", caption: "Your time, day by day", icon: "bar-chart-outline", tint: "#64D2FF" },
  milestones: { title: "My Milestones", caption: "Your next one to earn", icon: "ribbon-outline", tint: "#FFD60A" },
};
const spring = { damping: 22, stiffness: 260, mass: 0.7 };
const buzz = () => { if (tapHapticsEnabled()) tapHaptic(); };

/**
 * Home's edit mode: each section as a row with a grip on the right. Drag the
 * grip to move a section, as in a music queue; the others slide out of the way.
 * Runs on the UI thread; the new order is saved when a row is let go.
 */
export default function HomeArranger({ order, onChange }: { order: HomeSection[]; onChange: (order: HomeSection[]) => void }) {
  const positions = useSharedValue<Record<string, number>>(Object.fromEntries(order.map((key, index) => [key, index])));
  // A reset from Settings, or another phone's order, moves the rows too.
  const key = order.join();
  useEffect(() => { positions.set(Object.fromEntries(key.split(",").map((item, index) => [item, index]))); }, [key, positions]);
  const drop = (next: Record<string, number>) => onChange([...order].sort((a, b) => next[a] - next[b]));
  return <View style={{ height: order.length * STEP - GAP }} testID="home-arranger" accessibilityRole="list">
    {order.map((key, index) => <ArrangeRow key={key} id={key} index={index} count={order.length} positions={positions} onDrop={drop}
      onMove={direction => {
        // Screen readers move a section one place at a time instead of dragging.
        const target = index + direction; if (target < 0 || target >= order.length) return;
        const next = [...order]; [next[index], next[target]] = [next[target], next[index]];
        positions.set(Object.fromEntries(next.map((item, place) => [item, place]))); onChange(next);
      }} />)}
  </View>;
}

function ArrangeRow({ id, index, count, positions, onDrop, onMove }: {
  id: HomeSection; index: number; count: number; positions: SharedValue<Record<string, number>>;
  onDrop: (next: Record<string, number>) => void; onMove: (direction: -1 | 1) => void;
}) {
  const info = HOME_SECTION_INFO[id];
  const top = useSharedValue(index * STEP), start = useSharedValue(0), active = useSharedValue(false);
  useAnimatedReaction(() => positions.get()[id], (next, previous) => {
    if (next !== previous && next !== undefined && !active.get()) top.set(withSpring(next * STEP, spring));
  });
  const pan = useMemo(() => Gesture.Pan().minDistance(0)
    .onStart(() => { active.set(true); start.set(top.get()); runOnJS(buzz)(); })
    .onUpdate(event => {
      top.set(Math.max(0, Math.min((count - 1) * STEP, start.get() + event.translationY)));
      const place = Math.round(top.get() / STEP), from = positions.get()[id];
      if (place !== from) {
        const next = { ...positions.get() };
        for (const key of Object.keys(next)) if (next[key] === place) next[key] = from;
        next[id] = place; positions.set(next); runOnJS(buzz)();
      }
    })
    .onFinalize(() => {
      active.set(false); top.set(withSpring(positions.get()[id] * STEP, spring));
      runOnJS(onDrop)(positions.get());
    }), [count, id, positions, start, top, active, onDrop]);
  const style = useAnimatedStyle(() => ({
    top: top.get(), zIndex: active.get() ? 10 : 1,
    transform: [{ scale: withTiming(active.get() ? 1.03 : 1, { duration: 140 }) }],
    shadowOpacity: withTiming(active.get() ? 0.45 : 0, { duration: 140 }),
  }));
  return <Animated.View style={[s.row, style]} accessible accessibilityLabel={`${info.title}, place ${index + 1} of ${count}`}
    accessibilityActions={[{ name: "increment", label: "Move down" }, { name: "decrement", label: "Move up" }]}
    onAccessibilityAction={event => onMove(event.nativeEvent.actionName === "increment" ? 1 : -1)}>
    <View style={[s.icon, { backgroundColor: `${info.tint}26` }]}><Ionicons name={info.icon} size={18} color={info.tint} /></View>
    <View style={s.copy}><Text style={s.title}>{info.title}</Text><Text style={s.caption}>{info.caption}</Text></View>
    <GestureDetector gesture={pan}><View style={s.grip} hitSlop={8}><Ionicons name="reorder-three" size={26} color={colors.secondary} /></View></GestureDetector>
  </Animated.View>;
}
const s = StyleSheet.create({
  row: { ...edge, position: "absolute", left: 0, right: 0, height: ROW, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 14,
    borderRadius: radius.row + 4, backgroundColor: colors.surface, shadowColor: "#000", shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 0 },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  title: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  caption: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  grip: { width: 56, height: ROW, alignItems: "center", justifyContent: "center" },
});
