import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import ProfilePicture from "./adventurer/ProfilePicture";
import { useRewards } from "../hooks/useRewards";
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
 * Your level journey: the tier you're in up top with the amber level colour,
 * then every tier as a stop on one winding road.
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
    <Text style={s.sectionTitle} accessibilityRole="header">Your road</Text>
    <TierRoad level={level} current={progress.current.level} />
  </View>;
}

const ROW = 112;
/**
 * The road map: every tier is a stop on a winding road. Behind you the road
 * is lit, you stand at your tier with your own picture, and the stops ahead
 * wait, dimmed, with the level that opens them.
 */
function TierRoad({ level, current }: { level: number; current: number }) {
  const [width, setWidth] = useState(340);
  const rewards = useRewards({ load: false });
  const xs = (i: number) => (i % 2 === 0 ? 0.24 : 0.76) * width, ys = (i: number) => ROW / 2 + i * ROW;
  const at = LEVEL_TIERS.findIndex(tier => tier.level === current);
  const segment = (i: number) => `M${xs(i)} ${ys(i)} C${xs(i)} ${ys(i) + ROW * 0.55} ${xs(i + 1)} ${ys(i + 1) - ROW * 0.55} ${xs(i + 1)} ${ys(i + 1)}`;
  return <View style={{ height: ROW * LEVEL_TIERS.length }} onLayout={e => setWidth(e.nativeEvent.layout.width)} testID="tier-road">
    <Svg width={width} height={ROW * LEVEL_TIERS.length} style={StyleSheet.absoluteFill}>
      {LEVEL_TIERS.slice(0, -1).map((_, i) => <Path key={`bed-${i}`} d={segment(i)} stroke={colors.surfaceRaised} strokeWidth={14} strokeLinecap="round" fill="none" />)}
      {LEVEL_TIERS.slice(0, -1).map((_, i) => i < at
        ? <Path key={`lit-${i}`} d={segment(i)} stroke={colors.level} strokeWidth={5} strokeLinecap="round" fill="none" />
        : <Path key={`dash-${i}`} d={segment(i)} stroke="rgba(255,255,255,0.22)" strokeWidth={3} strokeDasharray="3 9" strokeLinecap="round" fill="none" />)}
    </Svg>
    {LEVEL_TIERS.map((tier, index) => {
      const here = tier.level === current, unlocked = level >= tier.level, left = index % 2 === 0;
      const rangeEnd = LEVEL_TIERS[index + 1]?.level;
      const levelRange = rangeEnd === tier.level + 1 ? `Level ${tier.level}` : rangeEnd ? `Levels ${tier.level}–${rangeEnd - 1}` : `Level ${tier.level}+`;
      const node = here ? 64 : 46, x = xs(index), y = ys(index);
      return <View key={tier.level} accessible accessibilityLabel={`${tier.title}, ${levelRange}, ${here ? "current tier" : unlocked ? "reached" : "locked"}`}
        style={[StyleSheet.absoluteFill, { top: y - ROW / 2, height: ROW, bottom: undefined }]}>
        <View style={[s.node, { left: x - node / 2, top: ROW / 2 - node / 2, width: node, height: node, borderRadius: node / 2,
          backgroundColor: unlocked ? `${tier.color}2E` : colors.surfaceRaised, borderColor: here ? colors.level : unlocked ? tier.color : "transparent" }]}>
          {here ? <CharacterPicture rewards={rewards} level={level} />
            : <Ionicons name={unlocked ? tier.icon : "lock-closed"} size={unlocked ? 20 : 15} color={unlocked ? tier.color : colors.tertiary} />}
        </View>
        <View style={[s.label, left ? { left: x + node / 2 + 12, right: 8 } : { right: width - x + node / 2 + 12, left: 8, alignItems: "flex-end" }, !unlocked && s.locked]}>
          <View style={[s.nameRow, !left && { justifyContent: "flex-end" }]}>
            <Text style={[s.tierTitle, { color: unlocked ? tier.color : colors.text }]} numberOfLines={1}>{tier.title}</Text>
            {here && <View style={s.herePill}><Text style={s.hereText} numberOfLines={1} maxFontSizeMultiplier={1.3}>You’re here</Text></View>}
          </View>
          <Text style={s.range}>{levelRange}</Text>
          <Text style={[s.hint, !left && { textAlign: "right" }]} numberOfLines={2}>{tier.detail}</Text>
        </View>
      </View>;
    })}
  </View>;
}
function CharacterPicture({ rewards, level }: { rewards: ReturnType<typeof useRewards>; level: number }) {
  return <ProfilePicture look={rewards.look} equipped={rewards.equipped} level={level} background={rewards.background} frame={rewards.frame} size={60} showLevel={false} />;
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
  node: { position: "absolute", alignItems: "center", justifyContent: "center", borderWidth: 2, overflow: "hidden" },
  label: { position: "absolute", top: 18, gap: 1 },
  locked: { opacity: 0.5 },
  detail: { flex: 1, minWidth: 0, gap: 6 },
  nameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  tierTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "700" },
  range: { color: colors.accent, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  // Never squeezed: the pill keeps its full width so "You’re here" never wraps or clips.
  herePill: { flexShrink: 0, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: colors.level },
  hereText: { color: colors.background, fontSize: 11, lineHeight: 14, fontWeight: "800" },
});
