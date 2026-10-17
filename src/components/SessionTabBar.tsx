import { floatingDockKey, useMeasureFloatingDock } from "../context/FloatingDockContext";
import { useFeatureTour } from "./FeatureTour";
import { Text } from "./AppText";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { BottomTabBar, type BottomTabBarProps } from "expo-router/js-tabs";
import { StyleSheet, TouchableOpacity, View, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../constants/theme";
import { useTimer } from "../context/TimerContext";
import { sessionDockState } from "../utils/sessionReporting";
import { PinnedActionHost, usePinnedActionPresent } from "./PinnedAction";

// Float only the pill and session banner over tab content, beneath the root modal.
// It cannot draw over Session while Session is entering or leaving.
export default function SessionTabBar(props: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const timer = useTimer();
  const { hasOpenSession, isRunning, isCompleted, sessionSummary } = timer;
  const dock = sessionDockState(timer);
  const measure = useMeasureFloatingDock();
  const tour = useFeatureTour();
  const { width, fontScale } = useWindowDimensions();
  const bannerVisible = !!(hasOpenSession || (sessionSummary && !timer.summaryViewed));
  const onHome = props.state?.routes?.[props.state.index]?.name === "index";
  const pinned = usePinnedActionPresent() && onHome;
  // On Home the pinned Continue button already shows the running session.
  const showBanner = bannerVisible && !(pinned && hasOpenSession);
  const layoutKey = floatingDockKey(bannerVisible, insets.bottom, width, fontScale, pinned);
  return <View pointerEvents="box-none" onLayout={event => { measure?.(layoutKey, event.nativeEvent.layout.height); tour?.reportDock?.(event.nativeEvent.layout.height); }} style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
    {/* Content fades into the background behind the bars, as on iOS, rather
      than showing through the gaps between them. */}
    <Svg pointerEvents="none" style={styles.scrim} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1 1">
      <Defs><LinearGradient id="dockScrim" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={colors.background} stopOpacity={0} />
        <Stop offset="0.3" stopColor={colors.background} stopOpacity={0.88} />
        <Stop offset="1" stopColor={colors.background} stopOpacity={0.96} />
      </LinearGradient></Defs>
      <Rect width="1" height="1" fill="url(#dockScrim)" />
    </Svg>
    {pinned && <PinnedActionHost />}
    {showBanner && <TouchableOpacity activeOpacity={1} style={styles.banner} onPress={() => router.navigate("/session")}
      accessibilityRole="button" accessibilityLabel={isCompleted ? "Open session completion" : isRunning ? "Expand running session" : "Expand paused session"}>
      {hasOpenSession && !timer.awaitingStart && timer.duration > 0 && <View pointerEvents="none" style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${timer.finishing ? 100 : Math.max(0, Math.min(1, 1 - timer.timeLeft / timer.duration)) * 100}%` }]} />
      </View>}
      <View style={styles.bannerCopy}>
        <View style={styles.bannerLabel}><Ionicons name={dock.icon} size={16} color={colors.primaryText} /><Text style={styles.title} numberOfLines={1}>{dock.label}</Text></View>
        {!!dock.detail && <Text style={styles.time} numberOfLines={1}>{hasOpenSession && !timer.awaitingStart ? `${dock.detail} left` : dock.detail}</Text>}
      </View>
      <View style={styles.bannerCircle}><Ionicons name="chevron-up" size={20} color={colors.primary} /></View>
    </TouchableOpacity>}
    <BottomTabBar {...props} />
  </View>;
}
const styles = StyleSheet.create({
  dock: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "transparent", paddingHorizontal: 20, paddingTop: 8, gap: 6 },
  scrim: { position: "absolute", top: -28, left: 0, right: 0, bottom: 0 },
  banner: { minHeight: 60, paddingLeft: 20, paddingRight: 10, paddingVertical: 8, borderRadius: 22, flexDirection: "row", alignItems: "center", gap: 12, overflow: "hidden", backgroundColor: colors.primary },
  title: { flexShrink: 1, color: colors.primaryText, fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.3 },
  time: { color: colors.primaryText, opacity: 0.68, fontSize: 14, lineHeight: 19, fontWeight: "500", fontVariant: ["tabular-nums"] },
  bannerCopy: { flex: 1, minWidth: 0, gap: 1 },
  bannerLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  bannerCircle: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryText },
  progressTrack: { position: "absolute", left: 0, right: 0, bottom: 0, height: 4, backgroundColor: "rgba(17,19,27,0.12)" },
  progressFill: { height: 4, backgroundColor: "rgba(17,19,27,0.78)" },
});
