import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import { Text } from "./AppText";
import { colors } from "../constants/theme";
import { LEVEL_TIERS, levelTierProgress } from "../utils/levelTiers";

interface ProgressProps { level: number; currentXP: number }
export function LevelTierPath({ level, currentXP }: ProgressProps) {
  const progress = levelTierProgress(level, currentXP);
  return <View style={s.stack}>
    <View style={s.summary}>
      <Text style={s.eyebrow}>YOUR CURRENT TIER</Text>
      <View style={s.summaryTitle}><Ionicons name={progress.current.icon} size={24} color={progress.current.color} /><Text style={s.currentTitle}>{progress.current.title}</Text><Text style={s.level}>Level {Math.max(1, level)}</Text></View>
      {progress.next ? <><View style={s.track} accessible accessibilityRole="progressbar" accessibilityLabel={`Progress towards ${progress.next.title}`} accessibilityValue={{ min: 0, max: 100, now: Math.round(progress.fraction * 100) }}><View style={[s.fill, { width: `${progress.fraction * 100}%`, backgroundColor: progress.current.color }]} /></View><Text style={s.hint}>Next tier: {progress.next.title} at level {progress.next.level}.</Text></> : <Text style={s.hint}>You’ve reached the final tier. Your level keeps growing.</Text>}
    </View>
    <Text style={s.body}>Each new level takes more focus time. The gaps between tiers grow as you progress, with milestones stretching to level 100 and beyond.</Text>
    <Text style={s.sectionTitle}>Your tier path</Text>
    {LEVEL_TIERS.map((tier, index) => {
      const current = tier.level === progress.current.level, unlocked = level >= tier.level;
      const rangeEnd = LEVEL_TIERS[index + 1]?.level;
      const levelRange = rangeEnd === tier.level + 1 ? `Level ${tier.level}` : rangeEnd ? `Levels ${tier.level}–${rangeEnd - 1}` : `Level ${tier.level}+`;
      return <View key={tier.level} style={[s.tier, current && s.currentTier]} accessible accessibilityLabel={`${tier.title}, ${levelRange}, ${current ? "current tier" : unlocked ? "reached" : "locked"}`}>
        <View style={[s.emblem, { backgroundColor: `${tier.color}18` }]}><Ionicons name={tier.icon} size={23} color={tier.color} /></View>
        <View style={s.detail}><View style={s.nameRow}><Text style={s.tierTitle}>{tier.title}</Text>{current && <Text style={s.currentLabel}>Current</Text>}</View><Text style={s.hint}>{levelRange}</Text><Text style={s.hint}>{tier.detail}</Text></View>
        <Ionicons name={unlocked ? "checkmark-circle-outline" : "lock-closed-outline"} size={18} color={unlocked ? tier.color : colors.muted} />
      </View>;
    })}
    <Text style={s.hint}>There is no final level. Your progress keeps growing beyond the last tier.</Text>
  </View>;
}
export default function LevelTierSheet({ visible, onClose, ...progress }: ProgressProps & { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return <AppSheet visible={visible} onRequestClose={onClose} expanded motionMode="timed" label="level tiers"
    header={<View style={s.header}><Text style={s.title}>Your growth, one tier at a time.</Text></View>}>
    <BottomSheetScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}><LevelTierPath {...progress} /></BottomSheetScrollView>
  </AppSheet>;
}
const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 16 }, title: { color: colors.text, fontSize: 23, lineHeight: 30, fontWeight: "500", letterSpacing: -0.4 },
  content: { paddingHorizontal: 20 }, stack: { gap: 12 }, summary: { padding: 16, gap: 10, borderRadius: 18, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  eyebrow: { color: colors.secondary, fontSize: 11, lineHeight: 17, letterSpacing: 1.1, fontWeight: "500" }, summaryTitle: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }, currentTitle: { color: colors.text, fontSize: 21, lineHeight: 27, fontWeight: "500" }, level: { color: colors.accent, fontSize: 13, lineHeight: 20 },
  body: { color: colors.secondary, fontSize: 15, lineHeight: 22 }, hint: { color: colors.secondary, fontSize: 13, lineHeight: 19 }, sectionTitle: { color: colors.text, fontSize: 17, lineHeight: 23, fontWeight: "500", marginTop: 4 },
  track: { height: 5, backgroundColor: colors.line, borderRadius: 3, overflow: "hidden" }, fill: { height: "100%", borderRadius: 3 },
  tier: { padding: 12, gap: 10, flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, currentTier: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  emblem: { height: 44, width: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" }, detail: { flex: 1, minWidth: 0, gap: 3 }, nameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 }, tierTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "500" }, currentLabel: { color: colors.accent, fontSize: 11, lineHeight: 18, fontWeight: "500" },
});
