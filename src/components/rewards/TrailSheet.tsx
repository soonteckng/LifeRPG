import { useEffect } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "../AppSheet";
import SheetHeader from "../SheetHeader";
import TodayTrail from "./TodayTrail";
import { useRewards } from "../../hooks/useRewards";
import { useUser } from "../../context/UserContext";
import { useShownLevel } from "../../services/levelPreview";

/**
 * Today's trail from Home: the same map you walk after a session, with you
 * standing where today's focus has taken you.
 */
export default function TrailSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const rewards = useRewards({ load: false });
  const { online, refresh } = rewards;
  // Reuse the shared, deduplicated read. Home may have stayed mounted across a
  // completed session or midnight; opening the map must catch up as well. It
  // waits until the sheet is up, so nothing redraws while it slides.
  useEffect(() => {
    if (!visible || !online) return;
    const later = setTimeout(() => { void refresh(); }, REFRESH_AFTER_MS);
    return () => clearTimeout(later);
  }, [visible, online, refresh]);
  const { width, height, fontScale } = useWindowDimensions();
  const { profile } = useUser();
  const { level } = useShownLevel(profile?.id, profile?.level);
  const minutes = Math.round(rewards.trail.findSeconds / 60);
  const subtitle = `A find every ${minutes} focused minutes, up to ${rewards.trail.stops * minutes} minutes a day.`;
  // The map is drawn with the sheet, before it slides up: a close guess at its
  // size the first time, its measured size every time after.
  const bottom = Math.max(insets.bottom, 16) + 8;
  const sheetHeight = Math.min(height * 0.88, Math.max(240, height - (insets.top || 0) - 24));
  const subtitleLines = Math.max(1, Math.ceil(subtitle.length * 7.6 * fontScale / Math.max(120, width - 84)));
  const header = 28 + (28 + 2 + subtitleLines * 20) * fontScale + 14;
  const stats = 61 * fontScale + 12;
  const initialSize = { width: Math.max(0, width - 62), height: Math.max(220, sheetHeight - header - 4 - bottom - 30 - stats) };
  return <AppSheet visible={visible} onRequestClose={onClose} expanded motionMode="timed" label="today's trail"
    header={<SheetHeader title="Today's trail" subtitle={subtitle} onClose={onClose} />}>
    <BottomSheetScrollView contentContainerStyle={[s.body, { paddingBottom: bottom }]} testID="trail-sheet">
      <TodayTrail fill seconds={rewards.today.seconds} findSeconds={rewards.trail.findSeconds} stops={rewards.trail.stops} finds={rewards.today.finds} pendingFinds={rewards.today.pendingFinds}
        complete={rewards.trail.complete} nextFindSeconds={rewards.nextFindSeconds} look={rewards.look} equipped={rewards.equipped} level={level}
        background={rewards.background} frame={rewards.frame} sizeKey="home-sheet" initialSize={initialSize} />
    </BottomSheetScrollView>
  </AppSheet>;
}

/** After the sheet's slide (about a third of a second). */
const REFRESH_AFTER_MS = 450;
const s = StyleSheet.create({ body: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 4 } });
