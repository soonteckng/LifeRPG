import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import { Text } from "./AppText";
import { colors, edge } from "../constants/theme";
import { LEVEL_TIERS, levelTierProgress } from "../utils/levelTiers";

interface ProgressProps { level: number; currentXP: number }
/**
 * Your level journey in the app's own look: the tier you're in up top with
 * the amber level colour, then every tier on one path. Reached tiers are lit,
 * the current one says so, and the ones ahead wait quietly.
 */
export function LevelTierPath({ level, currentXP }: ProgressProps) {
  const progress = levelTierProgress(level, currentXP), shown = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));
  return <View style={s.stack}>
    <View style={s.summary}>
      <View style={s.summaryRow}>
        <View style={[s.heroEmblem, { backgroundColor: `${progress.current.color}22` }]}><Ionicons name={progress.current.icon} size={30} color={progress.current.color} /></View>
        <View style={s.detail}>
          <View style={s.levelChip}><View style={s.levelBadge}><Text style={s.levelNumber}>{shown}</Text></View><Text style={s.levelText}>Level {shown}</Text></View>
          <Text style={s.currentTitle} numberOfLines={1}>{progress.current.title}</Text>
        </View>
      </View>
      {progress.next ? <>
        <View style={s.track} accessible accessibilityRole="progressbar" accessibilityLabel={`Progress towards ${progress.next.title}`} accessibilityValue={{ min: 0, max: 100, now: Math.round(progress.fraction * 100) }}>
          <View style={[s.fill, { width: `${Math.max(3, progress.fraction * 100)}%` }]} />
        </View>
        <Text style={s.hint}>Next tier: {progress.next.title} at level {progress.next.level}.</Text>
      </> : <Text style={s.hint}>You’ve reached the final tier. Your level keeps growing.</Text>}
    </View>
    <Text style={s.body}>Each new level takes a little more focus time, and the tiers spread out as you go. There’s no final level.</Text>
    <Text style={s.sectionTitle} accessibilityRole="header">Your tier path</Text>
    <View style={s.path}>
      {LEVEL_TIERS.map((tier, index) => {
        const current = tier.level === progress.current.level, unlocked = level >= tier.level, last = index === LEVEL_TIERS.length - 1;
        const rangeEnd = LEVEL_TIERS[index + 1]?.level;
        const levelRange = rangeEnd === tier.level + 1 ? `Level ${tier.level}` : rangeEnd ? `Levels ${tier.level}–${rangeEnd - 1}` : `Level ${tier.level}+`;
        const lit = unlocked && (LEVEL_TIERS[index + 1] ? level >= LEVEL_TIERS[index + 1].level : false);
        return <View key={tier.level} style={s.step} accessible accessibilityLabel={`${tier.title}, ${levelRange}, ${current ? "current tier" : unlocked ? "reached" : "locked"}`}>
          <View style={s.rail}>
            <View style={[s.emblem, { backgroundColor: unlocked ? `${tier.color}24` : colors.surfaceRaised }, current && { borderColor: colors.level, borderWidth: 2 }]}>
              <Ionicons name={unlocked ? tier.icon : "lock-closed"} size={unlocked ? 20 : 15} color={unlocked ? tier.color : colors.tertiary} />
            </View>
            {!last && <View style={[s.line, lit && s.lineLit]} />}
          </View>
          <View style={[s.tier, current && s.currentTier, !unlocked && s.locked]}>
            <View style={s.nameRow}><Text style={s.tierTitle}>{tier.title}</Text>{current && <View style={s.herePill}><Text style={s.hereText} numberOfLines={1} maxFontSizeMultiplier={1.3}>You’re here</Text></View>}</View>
            <Text style={s.range}>{levelRange}</Text>
            <Text style={s.hint}>{tier.detail}</Text>
          </View>
        </View>;
      })}
    </View>
  </View>;
}
export default function LevelTierSheet({ visible, onClose, ...progress }: ProgressProps & { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return <AppSheet visible={visible} onRequestClose={onClose} expanded motionMode="timed" label="level tiers"
    header={<SheetHeader title="Level tiers" subtitle="Your growth, one tier at a time." onClose={onClose} />}>
    <BottomSheetScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}><LevelTierPath {...progress} /></BottomSheetScrollView>
  </AppSheet>;
}
const s = StyleSheet.create({
  content: { paddingHorizontal: 20 }, stack: { gap: 14 },
  summary: { padding: 18, gap: 14, borderRadius: 24, backgroundColor: colors.sheetCard, ...edge },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  heroEmblem: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  levelChip: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, minHeight: 26, paddingLeft: 3, paddingRight: 10, borderRadius: 13, backgroundColor: colors.levelSoft },
  levelBadge: { minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.level },
  levelNumber: { color: colors.background, fontSize: 12, lineHeight: 15, fontWeight: "800" },
  levelText: { color: colors.level, fontSize: 13, lineHeight: 17, fontWeight: "700" },
  currentTitle: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: "700", letterSpacing: -0.4 },
  track: { height: 8, backgroundColor: colors.levelSoft, borderRadius: 4, overflow: "hidden" }, fill: { height: "100%", borderRadius: 4, backgroundColor: colors.level },
  body: { color: colors.secondary, fontSize: 15, lineHeight: 21 }, hint: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  sectionTitle: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: "700", marginTop: 4 },
  path: { gap: 0 },
  step: { flexDirection: "row", gap: 12 },
  rail: { width: 44, alignItems: "center" },
  emblem: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderColor: "transparent" },
  line: { flex: 1, width: 2, minHeight: 10, marginVertical: 4, borderRadius: 1, backgroundColor: colors.line },
  lineLit: { backgroundColor: colors.level },
  tier: { flex: 1, minWidth: 0, gap: 2, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 10, borderRadius: 18, backgroundColor: colors.sheetCard },
  currentTier: { backgroundColor: colors.levelSoft, borderWidth: 1, borderColor: "rgba(251,191,36,0.45)" },
  locked: { opacity: 0.55 },
  detail: { flex: 1, minWidth: 0, gap: 6 },
  nameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  tierTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "700" },
  range: { color: colors.accent, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  // Never squeezed: the pill keeps its full width so "You’re here" never wraps or clips.
  herePill: { flexShrink: 0, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: colors.level },
  hereText: { color: colors.background, fontSize: 11, lineHeight: 14, fontWeight: "800" },
});
