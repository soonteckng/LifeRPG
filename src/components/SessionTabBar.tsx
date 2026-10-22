import { tapHaptic, tapHapticsEnabled } from "../utils/tapHaptics";
import { floatingDockKey, useMeasureFloatingDock } from "../context/FloatingDockContext";
import { useFeatureTour } from "./FeatureTour";
import { Text } from "./AppText";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { BottomTabBar, type BottomTabBarProps } from "expo-router/js-tabs";
import { useEffect, useRef } from "react";
import { StyleSheet, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../constants/theme";
import { useTimer } from "../context/TimerContext";
import { sessionDockState } from "../utils/sessionReporting";
import { PinnedActionHost, usePinnedActionPresent } from "./PinnedAction";
import OfflineStatus from "./OfflineStatus";

// Float only the pill and session banner over tab content, beneath the root modal.
// It cannot draw over Session while Session is entering or leaving.
export default function SessionTabBar(props: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const timer = useTimer();
  const { hasOpenSession, isRunning, isCompleted, sessionSummary } = timer;
  // A fresh start reads as running at once; "Checking" only if it is slow.
  const dock = sessionDockState({ ...timer, awaitingStart: timer.startCheckVisible });
  const measure = useMeasureFloatingDock();
  const tour = useFeatureTour();
  const { width, fontScale } = useWindowDimensions();
  const bannerVisible = !!(hasOpenSession || (sessionSummary && !timer.summaryViewed));
  const route = props.state?.routes?.[props.state.index]?.name ?? "index";
  const pinned = usePinnedActionPresent(route);
  const layoutKey = floatingDockKey(bannerVisible, insets.bottom, width, fontScale, pinned);
  // The guide can point at a single tab: the pill is five equal slots.
  const bar = useRef<View>(null), register = tour?.register;
  useEffect(() => {
    if (!register) return;
    const offs = GUIDE_TABS.map((name, index) => register(`tab-${name}`, {
      measure: done => bar.current?.measureInWindow((x, y, w, h) => done({ x: x + (w * index) / GUIDE_TABS.length, y, width: w / GUIDE_TABS.length, height: h })),
      reveal: () => false,
    }));
    return () => offs.forEach(off => off());
  }, [register]);
  return <View pointerEvents="box-none" onLayout={event => { measure?.(layoutKey, event.nativeEvent.layout.height); tour?.reportDock?.(event.nativeEvent.layout.height); }} style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
    {/* A floating dock: nothing paints behind the bars, so the page stays
      visible around them and only the bars themselves sit on top. */}
    {/* Floats just above the dock, over the content, with no bar behind it. */}
    <View pointerEvents="box-none" style={styles.offline}><OfflineStatus /></View>
    {pinned && <PinnedActionHost route={route} />}
    {bannerVisible && <TouchableOpacity activeOpacity={1} style={styles.banner} onPress={() => { if (tapHapticsEnabled()) tapHaptic(); router.navigate("/session"); }}
      accessibilityRole="button" accessibilityLabel={isCompleted ? "Open session completion" : timer.breakSecondsLeft > 0 ? "Expand session on break" : isRunning ? "Expand running session" : "Expand paused session"}>
      {hasOpenSession && !timer.startCheckVisible && timer.duration > 0 && <View pointerEvents="none" style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${timer.finishing ? 100 : Math.max(0, Math.min(1, 1 - timer.timeLeft / timer.duration)) * 100}%` }]} />
      </View>}
      <View style={styles.bannerCopy}>
        <View style={styles.bannerLabel}><Ionicons name={dock.icon} size={16} color={colors.primaryText} /><Text style={styles.title} numberOfLines={1}>{dock.label}</Text></View>
        {!!dock.detail && <Text style={styles.time} numberOfLines={1}>{hasOpenSession && !timer.startCheckVisible ? `${dock.detail} left` : dock.detail}</Text>}
      </View>
      <View style={styles.bannerCircle}><Ionicons name="chevron-up" size={20} color={colors.primary} /></View>
    </TouchableOpacity>}
    <View ref={bar} collapsable={false}><BottomTabBar {...props} /></View>
  </View>;
}
const GUIDE_TABS = ["index", "routines", "study", "squads", "progress"] as const;
const styles = StyleSheet.create({
  dock: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "transparent", paddingHorizontal: 20, paddingTop: 10, gap: 10 },
  offline: { position: "absolute", top: -42, left: 20, right: 20 },
  banner: { minHeight: 60, paddingLeft: 22, paddingRight: 9, paddingVertical: 8, borderRadius: 30, flexDirection: "row", alignItems: "center", gap: 12, overflow: "hidden", backgroundColor: colors.primary },
  title: { flexShrink: 1, color: colors.primaryText, fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.3 },
  time: { color: colors.primaryText, opacity: 0.68, fontSize: 14, lineHeight: 20, fontWeight: "500", fontVariant: ["tabular-nums"] },
  bannerCopy: { flex: 1, minWidth: 0, gap: 1 },
  bannerLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  bannerCircle: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryText },
  progressTrack: { position: "absolute", left: 0, right: 0, bottom: 0, height: 4, backgroundColor: "rgba(255,255,255,0.22)" },
  progressFill: { height: 4, backgroundColor: "rgba(255,255,255,0.9)" },
});
