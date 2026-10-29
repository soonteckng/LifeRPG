import { StyleSheet, View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "../MotionPressable";
import SheetButton from "../SheetTouchable";
import { Text } from "../AppText";
import AppSheet from "../AppSheet";
import SheetHeader from "../SheetHeader";
import ItemArt from "../adventurer/ItemArt";
import { colors, edge } from "../../constants/theme";
import { rewardItem } from "../../services/rewardCatalog";
import type { ChosenRewards } from "../../services/rewardsService";
import { RARITY_COLOR } from "./rarity";

const KIND: Record<string, string> = { wearable: "Outfit piece", background: "Picture background", decor: "Camp decoration" };
const kindLabel = (id: string) => KIND[rewardItem(id)?.kind ?? ""] ?? "Reward";

/** Saved goal days toward the next reward, as filled dots: never more than one reward's worth. */
function Dots({ filled, total }: { filled: number; total: number }) {
  return <View style={s.dots} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
    {Array.from({ length: total }, (_, i) => <View key={i} style={[s.dot, i < filled && s.dotOn]} />)}
  </View>;
}

/**
 * Home's reward card: what you're working toward and how many goal days you
 * have saved for it. Tapping it opens the choice.
 */
export function ChosenRewardCard({ chosen, onOpen }: { chosen: ChosenRewards; onOpen: () => void }) {
  const need = chosen.requiredDays, saved = chosen.balance, target = chosen.target ? rewardItem(chosen.target) : undefined;
  const toward = Math.min(saved, need);
  const allCollected = !chosen.target && chosen.offers.length === 0;
  if (allCollected) return <View testID="home-chosen" style={s.quiet} accessible
    accessibilityLabel={`Everything is collected. ${saved} goal ${saved === 1 ? "day" : "days"} saved for new rewards.`}>
    <Ionicons name="trophy-outline" size={18} color={colors.level} />
    <Text style={s.quietText} numberOfLines={2}>{`Everything collected · ${saved} goal ${saved === 1 ? "day" : "days"} saved for what comes next`}</Text>
  </View>;
  const label = target ? `Working toward ${target.name}. ${toward} of ${need} goal days. Tap to change.`
    : `Choose a reward to work toward. ${saved} goal ${saved === 1 ? "day" : "days"} saved.`;
  return <Pressable testID="home-chosen" onPress={onOpen} accessibilityRole="button" accessibilityLabel={label}
    style={[s.card, target && { borderColor: RARITY_COLOR[target.rarity] + "66" }]}>
    <View style={[s.art, target && { backgroundColor: RARITY_COLOR[target.rarity] + "1F" }]}>
      {target ? <ItemArt id={target.id} size={40} /> : <Ionicons name="gift-outline" size={24} color={colors.secondary} />}
    </View>
    <View style={s.copy}>
      <Text style={s.title} numberOfLines={1}>{target ? target.name : "Choose your next reward"}</Text>
      {target ? <View style={s.progressRow}><Dots filled={toward} total={need} />
        <Text style={s.detail} numberOfLines={1}>{`${toward} of ${need} goal days`}</Text></View>
        : <Text style={s.detail} numberOfLines={2}>{saved > 0 ? `${saved} goal ${saved === 1 ? "day" : "days"} saved. Pick what they go toward.`
          : `Reach your daily goal on ${need} days to earn it.`}</Text>}
    </View>
    <Ionicons name="chevron-forward" size={18} color={colors.tertiary} />
  </Pressable>;
}

/**
 * Choosing what to work toward: up to four rewards you don't own yet. Saved
 * days are never lost: switching keeps them, and so does getting the reward
 * some other way first.
 */
export function ChosenRewardSheet({ visible, chosen, busy, message, onChoose, onClose, extra }: {
  visible: boolean; chosen: ChosenRewards | undefined; busy: boolean; message?: string;
  onChoose: (item: string | null) => void; onClose: () => void;
  /** Developer controls under the same real choice. */
  extra?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const need = chosen?.requiredDays ?? 5, saved = chosen?.balance ?? 0;
  // Plain values: the production compiler reads paths used in callbacks eagerly.
  const target = chosen?.target ?? null, offers = chosen?.offers ?? [], loaded = !!chosen;
  return <AppSheet visible={visible} onRequestClose={onClose} label="choose a reward" compact maxHeightRatio={0.9} motionMode="timed"
    header={<SheetHeader title="Work toward a reward" closeLabel="Close reward choice" onClose={onClose}
      subtitle={`Reach your daily goal on ${need} days, in any order. Missed days never undo your progress.`} />}>
    <BottomSheetScrollView contentContainerStyle={[s.body, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]} testID="chosen-sheet">
      <View style={s.saved} accessible accessibilityLabel={`${saved} goal ${saved === 1 ? "day" : "days"} saved`}>
        <Dots filled={Math.min(saved, need)} total={need} />
        <Text style={s.savedText}>{saved === 1 ? "1 goal day saved" : `${saved} goal days saved`}
          {saved > need ? <Text style={s.savedExtra}>{` · enough for ${Math.floor(saved / need)}`}</Text> : null}</Text>
      </View>
      {loaded && offers.length === 0 && <Text style={s.empty}>{"You own everything you can work toward. Your saved days wait for new rewards."}</Text>}
      <View style={s.grid}>
        {offers.map(({ item: id }) => {
          const item = rewardItem(id);
          if (!item) return null;
          const selected = target === id, color = RARITY_COLOR[item.rarity];
          const ready = !selected && saved >= need;
          return <SheetButton key={id} testID={`chosen-offer-${id}`} disabled={busy} onPress={() => onChoose(selected ? null : id)}
            accessibilityRole="button" accessibilityState={{ selected, disabled: busy }}
            accessibilityLabel={`${item.name}, ${kindLabel(id)}${selected ? ", working toward this. Tap to stop." : ready ? ". You have enough days: choosing it earns it now." : ""}`}
            style={[s.offer, selected && { borderColor: color, backgroundColor: color + "14" }]}>
            {selected && <View style={[s.badge, { backgroundColor: color }]}><Ionicons name="checkmark" size={14} color="#0B0F1A" /></View>}
            <View style={s.offerArt}><ItemArt id={id} size={64} /></View>
            <Text style={s.offerName} numberOfLines={2}>{item.name}</Text>
            <Text style={[s.offerKind, { color }]} numberOfLines={1}>{kindLabel(id)}</Text>
            {ready && <Text style={s.offerReady} numberOfLines={1}>Earn it now</Text>}
          </SheetButton>;
        })}
      </View>
      {!!message && <Text style={s.message} accessibilityLiveRegion="polite">{message}</Text>}
      {!!target && <Text style={s.hint}>{"Tap your choice again to stop. Your saved days stay."}</Text>}
      {extra}
    </BottomSheetScrollView>
  </AppSheet>;
}

const s = StyleSheet.create({
  card: { ...edge, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, backgroundColor: colors.surface },
  art: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)" },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { color: colors.text, fontSize: 16, fontWeight: "700" },
  detail: { color: colors.secondary, fontSize: 13 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dots: { flexDirection: "row", gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.12)" },
  dotOn: { backgroundColor: colors.level },
  quiet: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 2 },
  quietText: { flex: 1, color: colors.secondary, fontSize: 13 },
  body: { paddingHorizontal: 20, paddingTop: 4, gap: 14 },
  saved: { flexDirection: "row", alignItems: "center", gap: 10 },
  savedText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  savedExtra: { color: colors.level, fontWeight: "600" },
  empty: { color: colors.secondary, fontSize: 15, lineHeight: 21 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  offer: { ...edge, width: "48%", flexGrow: 1, alignItems: "center", gap: 4, paddingVertical: 14, paddingHorizontal: 10, borderRadius: 18, backgroundColor: colors.sheetCard },
  offerArt: { width: 72, height: 72, alignItems: "center", justifyContent: "center" },
  offerName: { color: colors.text, fontSize: 15, fontWeight: "700", textAlign: "center" },
  offerKind: { fontSize: 12, fontWeight: "600" },
  offerReady: { color: colors.level, fontSize: 12, fontWeight: "700" },
  badge: { position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  message: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  hint: { color: colors.tertiary, fontSize: 13, textAlign: "center" },
});
