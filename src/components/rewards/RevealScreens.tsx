import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "../MotionPressable";
import { Text } from "../AppText";
import Adventurer from "../adventurer/Adventurer";
import ItemArt, { StardustArt } from "../adventurer/ItemArt";
import { CampScene } from "../session/TrailScenes";
import PackArt, { PACK_COLORS } from "./PackArt";
import TodayTrail from "./TodayTrail";
import { RARITY_COLOR, RARITY_NAME } from "./rarity";
import { colors } from "../../constants/theme";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { PACK_TIERS, SETS, rewardItem } from "../../services/rewardCatalog";
import type { Gift } from "../../services/rewardsService";
import type { Reveal } from "../../services/rewardsStore";
import type { AdventurerLook } from "../../utils/adventurerLook";
import { tapHaptic } from "../../utils/tapHaptics";

export interface RevealPlayer {
  look: AdventurerLook; equipped: Partial<Record<string, string>>; level: number; background: string; frame: string | null;
  today: { seconds: number; finds: number }; nextFindSeconds: number;
}
type Props<R> = { reveal: R; player: RevealPlayer; onClose: () => void; onOutfits: () => void };
const wearable = (g: Gift) => { const k = rewardItem(g.item)?.kind; return g.new && (k === "wearable" || k === "background" || k === "pet"); };

/** One thing found: its picture, name and rarity, and whether it's new or became Stardust. */
function GiftRow({ gift }: { gift: Gift }) {
  const item = rewardItem(gift.item);
  if (!item) return null;
  const color = RARITY_COLOR[gift.rarity];
  return <View style={s.gift} accessible accessibilityLabel={`${item.name}, ${RARITY_NAME[gift.rarity]}${gift.new ? ", new" : `, already yours, ${gift.stardust} Stardust instead`}`}>
    <View style={[s.giftArt, { borderColor: color + "99", backgroundColor: color + "1A" }]}><ItemArt id={gift.item} size={46} /></View>
    <View style={s.flex}>
      <Text style={s.giftName} numberOfLines={1}>{item.name}</Text>
      <Text style={[s.giftRarity, { color }]}>{RARITY_NAME[gift.rarity]}{item.set ? ` · ${SETS[item.set].name} set` : ""}</Text>
    </View>
    {gift.new ? <View style={s.newPill}><Text style={s.newText}>NEW</Text></View>
      : <View style={s.dustPill}><StardustArt size={13} /><Text style={s.dustText}>{`+${gift.stardust}`}</Text></View>}
  </View>;
}

/**
 * Back at camp after a session: you walk back along the path, then see what
 * the trip brought: finds, Stardust and today's trail so far.
 */
export function ExpeditionReveal({ reveal, player, onClose, onOutfits }: Props<Extract<Reveal, { kind: "expedition" }>>) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [step, setStep] = useState<"back" | "found">("back");
  const walk = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    tapHaptic("success");
    if (!reduced) walk.value = withTiming(1, { duration: 1900, easing: Easing.out(Easing.quad) });
  }, [walk, reduced]);
  // Down the path towards you, growing as you come closer.
  const walker = useAnimatedStyle(() => ({ opacity: Math.min(1, walk.value * 3), transform: [{ translateY: (1 - walk.value) * -height * 0.26 }, { translateX: (1 - walk.value) * width * 0.05 }, { scale: 0.4 + walk.value * 0.6 }] }));
  const minutes = reveal.seconds === null ? null : Math.round(reveal.seconds / 60);
  const found = reveal.finds.length;
  if (step === "back") {
    const size = Math.min(150, width * 0.36);
    return <View style={s.page} testID="reveal-expedition">
      <CampScene width={width} height={height} />
      <View style={[s.campCopy, { top: insets.top + 40 }]}>
        <View style={s.campChip}><Ionicons name="checkmark-circle" size={15} color="#2DD4A7" /><Text style={s.campChipText}>BACK AT CAMP</Text></View>
        <Text style={s.campTitle} numberOfLines={2}>{minutes ? `${minutes} ${minutes === 1 ? "minute" : "minutes"}, done` : "Back at camp"}</Text>
        <Text style={s.campBody}>{found ? `Your pack looks heavier · ${found} ${found === 1 ? "find" : "finds"}` : `+${reveal.stardust} Stardust from the trail`}</Text>
      </View>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", left: width / 2 - size / 2, bottom: height * 0.13 }, walker]}>
        <Adventurer look={player.look} equipped={player.equipped} size={size} />
      </Animated.View>
      <View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <Pressable onPress={() => setStep("found")} accessibilityRole="button" accessibilityLabel="See what you found" style={s.primary}><Text style={s.primaryText}>See what you found</Text></Pressable>
      </View>
    </View>;
  }
  return <View style={[s.page, s.dark, { paddingTop: insets.top + 16 }]} testID="reveal-expedition-found">
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <Text style={s.eyebrow}>{minutes ? `FROM YOUR ${minutes}-MINUTE WALK` : "FROM THE TRAIL"}</Text>
      <Text style={s.heading} accessibilityRole="header">{found ? "What you found" : "Stardust on the way"}</Text>
      <View style={s.gifts}>{reveal.finds.map((g, i) => <GiftRow key={`${g.item}-${i}`} gift={g} />)}</View>
      <View style={s.dustRow} accessible accessibilityLabel={`${reveal.stardust} Stardust`}>
        <StardustArt size={22} /><Text style={s.dustBig}>{`+${reveal.stardust} Stardust`}</Text>
      </View>
      <TodayTrail seconds={player.today.seconds} finds={player.today.finds} nextFindSeconds={player.nextFindSeconds}
        look={player.look} equipped={player.equipped} level={player.level} background={player.background} frame={player.frame} />
    </ScrollView>
    <View style={[s.bottomStatic, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Continue" style={s.primary}><Text style={s.primaryText}>Continue</Text></Pressable>
      {reveal.finds.some(wearable) && <Pressable onPress={onOutfits} accessibilityRole="button" accessibilityLabel="See it in Outfits" style={s.secondary}><Text style={s.secondaryText}>See it in Outfits</Text></Pressable>}
    </View>
  </View>;
}

/** Today's supply pack: tap to open, then what was inside. */
export function PackReveal({ reveal, onClose, onOutfits }: Props<Extract<Reveal, { kind: "pack" }>>) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [stage, setStage] = useState<"closed" | "shaking" | "open">("closed");
  const open = stage === "open";
  const sway = useSharedValue(0), pop = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    if (stage === "closed") {
      sway.value = withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), withTiming(-1, { duration: 900, easing: Easing.inOut(Easing.sin) })), -1, true);
      return;
    }
    if (stage === "shaking") {
      // A quick shake, then it opens and the contents pop up.
      sway.value = withSequence(withTiming(-2.4, { duration: 70 }), withTiming(2.4, { duration: 70 }), withTiming(-2, { duration: 70 }), withTiming(0, { duration: 70 }));
      const later = setTimeout(() => setStage("open"), 290);
      return () => clearTimeout(later);
    }
    pop.value = withSpring(1, { damping: 12, stiffness: 140 });
  }, [stage, sway, pop, reduced]);
  const tier = Math.max(0, Math.min(3, reveal.tier)), color = PACK_COLORS[tier], name = PACK_TIERS[tier].name;
  const next = PACK_TIERS[tier + 1];
  const openIt = () => { if (stage !== "closed") return; tapHaptic("success"); setStage(reduced ? "open" : "shaking"); };
  const packStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${sway.value * 3}deg` }] }));
  const popStyle = useAnimatedStyle(() => ({ opacity: pop.value, transform: [{ scale: 0.6 + pop.value * 0.4 }] }));
  return <View style={[s.page, s.dark, { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 16) + 8 }]} testID="reveal-pack">
    <View style={s.packTop}>
      <Text style={[s.eyebrow, { color }]}>{open ? "INSIDE YOUR PACK" : "TODAY'S SUPPLY PACK"}</Text>
      <Text style={s.heading}>{`${name} pack`}</Text>
      <Text style={s.sub}>{`${reveal.daysInARow} ${reveal.daysInARow === 1 ? "day" : "days"} in a row`}</Text>
    </View>
    <View style={s.packCenter}>
      <Animated.View style={packStyle}><PackArt tier={tier} size={open ? 150 : 210} open={open} /></Animated.View>
      {open && <Animated.View style={[s.packGifts, popStyle]}>
        {reveal.items.map((g, i) => <GiftRow key={`${g.item}-${i}`} gift={g} />)}
        <View style={s.dustRow}><StardustArt size={22} /><Text style={s.dustBig}>{`+${reveal.stardust} Stardust`}</Text></View>
        <Text style={s.note}>{next ? `Reach your goal ${next.days} days in a row for a ${next.name} pack. A missed day steps back one pack.` : "The Crystal pack is yours every day you keep your goal going."}</Text>
      </Animated.View>}
    </View>
    <View style={s.bottomStatic}>
      {open ? <>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Continue" style={s.primary}><Text style={s.primaryText}>Continue</Text></Pressable>
        {reveal.items.some(wearable) && <Pressable onPress={onOutfits} accessibilityRole="button" accessibilityLabel="See it in Outfits" style={s.secondary}><Text style={s.secondaryText}>See it in Outfits</Text></Pressable>}
      </> : <Pressable onPress={openIt} accessibilityRole="button" accessibilityLabel={`Open your ${name} pack`} style={[s.primary, { backgroundColor: color }]}><Text style={[s.primaryText, { color: "#14111F" }]}>Open it</Text></Pressable>}
    </View>
  </View>;
}

const s = StyleSheet.create({
  page: { flex: 1 }, flex: { flex: 1, minWidth: 0 },
  dark: { backgroundColor: "#0B0F1A", paddingHorizontal: 20 },
  campCopy: { position: "absolute", left: 24, right: 24, alignItems: "center", gap: 8 },
  campChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 28, borderRadius: 14, backgroundColor: "rgba(9,12,20,0.55)" },
  campChipText: { color: "#E5E7EB", fontSize: 12, letterSpacing: 1.6, fontWeight: "800" },
  campTitle: { color: "#FFFFFF", fontSize: 30, lineHeight: 36, fontWeight: "800", textAlign: "center", textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 8 },
  campBody: { color: "#F3F4F6", fontSize: 16, lineHeight: 22, textAlign: "center" },
  bottom: { position: "absolute", left: 20, right: 20, bottom: 0, gap: 8 },
  bottomStatic: { gap: 8, paddingTop: 12 },
  scroll: { gap: 14, paddingBottom: 16 },
  eyebrow: { color: colors.level, fontSize: 12, letterSpacing: 1.6, fontWeight: "800", textAlign: "center" },
  heading: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "800", textAlign: "center" },
  sub: { color: colors.secondary, fontSize: 15, textAlign: "center" },
  gifts: { gap: 8 },
  gift: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.05)" },
  giftArt: { width: 60, height: 60, borderRadius: 16, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  giftName: { color: colors.text, fontSize: 16, fontWeight: "700" },
  giftRarity: { fontSize: 13, fontWeight: "600" },
  newPill: { paddingHorizontal: 9, minHeight: 24, borderRadius: 12, justifyContent: "center", backgroundColor: "#2DD4A7" },
  newText: { color: "#052E25", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  dustPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, minHeight: 24, borderRadius: 12, backgroundColor: "rgba(167,139,250,0.18)" },
  dustText: { color: "#DDD6FE", fontSize: 13, fontWeight: "800" },
  dustRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 6 },
  dustBig: { color: "#DDD6FE", fontSize: 18, fontWeight: "800" },
  packTop: { alignItems: "center", gap: 6 },
  packCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  packGifts: { alignSelf: "stretch", gap: 10 },
  note: { color: colors.secondary, fontSize: 13, lineHeight: 18, textAlign: "center", paddingHorizontal: 8 },
  primary: { minHeight: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: "700" },
  secondary: { minHeight: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: colors.neutral, fontSize: 16, fontWeight: "600" },
});
