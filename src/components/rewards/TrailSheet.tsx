import { StyleSheet, View } from "react-native";
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
  const { profile } = useUser();
  const { level } = useShownLevel(profile?.id, profile?.level);
  const minutes = Math.round(rewards.trail.findSeconds / 60);
  return <AppSheet visible={visible} onRequestClose={onClose} expanded motionMode="timed" label="today's trail"
    header={<SheetHeader title="Today's trail" subtitle={`A find every ${minutes} focused minutes, up to ${rewards.trail.stops * minutes} minutes a day.`} onClose={onClose} />}>
    <View style={[s.body, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} testID="trail-sheet">
      {visible && <TodayTrail fill seconds={rewards.today.seconds} findSeconds={rewards.trail.findSeconds} stops={rewards.trail.stops} finds={rewards.today.finds}
        complete={rewards.trail.complete} nextFindSeconds={rewards.nextFindSeconds} look={rewards.look} equipped={rewards.equipped} level={level}
        background={rewards.background} frame={rewards.frame} />}
    </View>
  </AppSheet>;
}

const s = StyleSheet.create({ body: { flex: 1, paddingHorizontal: 16, paddingTop: 4 } });
