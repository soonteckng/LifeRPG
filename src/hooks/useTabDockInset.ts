import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { useTimer } from "../context/TimerContext";
import { floatingDockKey, useFloatingDockHeight } from "../context/FloatingDockContext";
import { usePinnedActionPresent } from "../components/PinnedAction";
import { floatingTabInset } from "../utils/floatingTabInset";

/** Space to leave at the end of a tab's scroll for the dock, its banner and any pinned Start. */
export function useTabDockInset(route: string) {
  const timer = useTimer(), insets = useSafeAreaInsets(), { width, fontScale } = useWindowDimensions();
  const estimate = floatingTabInset(useBottomTabBarHeight(), insets.bottom, timer);
  const banner = !!(timer.hasOpenSession || (timer.sessionSummary && !timer.summaryViewed));
  const pinned = usePinnedActionPresent(route);
  return useFloatingDockHeight(floatingDockKey(banner, insets.bottom, width, fontScale, pinned), estimate + (pinned ? 66 : 0));
}
