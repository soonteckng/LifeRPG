import { useEffect } from "react";
import { StyleSheet } from "react-native";
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
  // completed session or midnight; opening the map must catch up as well.
  useEffect(() => { if (visible && online) void refresh(); }, [visible, online, refresh]);
  const { profile } = useUser();
  const { level } = useShownLevel(profile?.id, profile?.level);
  const minutes = Math.round(rewards.trail.findSeconds / 60);
  return <AppSheet visible={visible} onRequestClose={onClose} expanded motionMode="timed" label="today's trail"
    header={<SheetHeader title="Today's trail" subtitle={`A find every ${minutes} focused minutes, up to ${rewards.trail.stops * minutes} minutes a day.`} onClose={onClose} />}>
    <BottomSheetScrollView contentContainerStyle={[s.body, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} testID="trail-sheet">
      <TodayTrail fill seconds={rewards.today.seconds} findSeconds={rewards.trail.findSeconds} stops={rewards.trail.stops} finds={rewards.today.finds} pendingFinds={rewards.today.pendingFinds}
        complete={rewards.trail.complete} nextFindSeconds={rewards.nextFindSeconds} look={rewards.look} equipped={rewards.equipped} level={level}
        background={rewards.background} frame={rewards.frame} />
    </BottomSheetScrollView>
  </AppSheet>;
}

const s = StyleSheet.create({ body: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 4 } });
