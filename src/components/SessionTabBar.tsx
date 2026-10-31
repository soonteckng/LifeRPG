import { tapHaptic, tapHapticsEnabled } from "../utils/tapHaptics";
import { floatingDockKey, useMeasureFloatingDock } from "../context/FloatingDockContext";
import { useFeatureTour } from "./FeatureTour";
import { Text } from "./AppText";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { StyleSheet, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../constants/theme";
import { useTimer } from "../context/TimerContext";
import { sessionEntry } from "../services/sessionEntry";
import { sessionDockState } from "../utils/sessionReporting";
import { PinnedActionHost, usePinnedActionPresent } from "./PinnedAction";
import OfflineStatus from "./OfflineStatus";

// There is no tab bar: Today is home and every page opens from it. What floats
// at the bottom is only what you need wherever you are: the way back into an
// open session, the offline notice and a page's pinned action. It sits beneath
// the root modal, so it never draws over Session while Session moves.
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
  return <View pointerEvents="box-none" onLayout={event => { measure?.(layoutKey, event.nativeEvent.layout.height); tour?.reportDock?.(event.nativeEvent.layout.height); }} style={[styles.dock, { paddingBottom: bannerVisible || pinned ? Math.max(insets.bottom, 12) : insets.bottom }]}>
    {/* A floating dock: nothing paints behind the bars, so the page stays
      visible around them and only the bars themselves sit on top. */}
    {/* Floats just above the dock, over the content, with no bar behind it. */}
    <View pointerEvents="box-none" style={styles.offline}><OfflineStatus /></View>
    {pinned && <PinnedActionHost route={route} />}
    {bannerVisible && <TouchableOpacity activeOpacity={1} style={styles.banner} onPress={() => { if (tapHapticsEnabled()) tapHaptic(); sessionEntry.request(timer.protectionSessionId ?? timer.sessionId ?? sessionSummary?.sessionId); router.navigate("/session"); }}
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
  </View>;
}
const styles = StyleSheet.create({
  dock: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "transparent", paddingHorizontal: 20, paddingTop: 10, gap: 10 },
  offline: { position: "absolute", top: -42, left: 20, right: 20 },
  banner: { minHeight: 60, paddingLeft: 22, paddingRight: 9, paddingVertical: 8, borderRadius: 30, flexDirection: "row", alignItems: "center", gap: 12, overflow: "hidden", backgroundColor: colors.primary },
  title: { flexShrink: 1, color: colors.primaryText, fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.3 },
  time: { color: colors.primaryText, opacity: 0.68, fontSize: 14, lineHeight: 20, fontWeight: "500", fontVariant: ["tabular-nums"] },
  bannerCopy: { flex: 1, minWidth: 0, gap: 1 },
  bannerLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  bannerCircle: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryText },
  progressTrack: { position: "absolute", left: 0, right: 0, bottom: 0, height: 4, backgroundColor: "rgba(34,25,31,0.16)" },
  progressFill: { height: 4, backgroundColor: "rgba(34,25,31,0.7)" },
});
