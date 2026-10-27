import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import Pressable from "../MotionPressable";
import { Text } from "../AppText";
import ItemArt, { StardustArt } from "../adventurer/ItemArt";
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
  today: { seconds: number; finds: number; pendingFinds?: number }; nextFindSeconds: number; trail: { findSeconds: number; stops: number; complete: boolean };
}
/** onOutfits gets the item to show there, so Outfits opens on its category. */
type Props<R> = { reveal: R; player: RevealPlayer; onClose: () => void; onOutfits: (item: string) => void };
const wearable = (g: Gift) => { const k = rewardItem(g.item)?.kind; return g.new && (k === "wearable" || k === "background" || k === "pet"); };
// Keep the existing try-on priority. A decoration-only find or pack can now
// lead to its real inventory too, including an already-owned duplicate.
const firstCollectible = (gifts: Gift[]) => gifts.find(wearable)?.item ?? gifts.find(g => rewardItem(g.item)?.kind === "decor")?.item;
const itemDestination = (id: string) => rewardItem(id)?.kind === "decor" ? "View in Collection" : "See it in Outfits";

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
      {!gift.new && <Text style={s.giftRarity}>Already yours</Text>}
    </View>
    {gift.new ? <View style={s.newPill}><Text style={s.newText}>NEW</Text></View>
      : <View style={s.dustPill}><StardustArt size={13} /><Text style={s.dustText}>{`+${gift.stardust}`}</Text></View>}
  </View>;
}

/**
 * After a session: first what you found, on one big card (every find from
 * the session together, however long it was), then today's trail, where you
 * walk on from where you were to where you are now. A session with nothing
 * found goes straight to the trail. "See it in Outfits" comes back to the card.
 */
export function ExpeditionReveal({ reveal, player, onClose, onOutfits }: Props<Extract<Reveal, { kind: "expedition" }>>) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState<"found" | "trail">(reveal.finds.length ? "found" : "trail");
  // The card fades away, then the trail fades in (its map draws once it has settled).
  const shown = useSharedValue(1);
  const toTrail = () => {
    if (reduced) { setStep("trail"); return; }
    shown.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) }, done => { if (done) runOnJS(setStep)("trail"); });
  };
  useEffect(() => {
    if (step === "trail" && !reduced) shown.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.quad) });
  }, [step, shown, reduced]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));
  return <Animated.View style={[s.page, fade]}>
    {step === "found" ? <FoundCard reveal={reveal} onContinue={toTrail} onOutfits={onOutfits} />
      : <TrailStep reveal={reveal} player={player} onClose={onClose} />}
  </Animated.View>;
}

// The card plays in order: the card rises, each find is dealt onto it, then
// the Stardust counts up.
const DEAL_AT = 420, DEAL_GAP = 260;
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

function FoundCard({ reveal, onContinue, onOutfits }: {
  reveal: Extract<Reveal, { kind: "expedition" }>; onContinue: () => void; onOutfits: (item: string) => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const minutes = reveal.seconds === null ? null : Math.round(reveal.seconds / 60);
  const found = reveal.finds.length, show = firstCollectible(reveal.finds);
  const best = reveal.finds.reduce((top, g) => Math.max(top, RARITY_ORDER.indexOf(g.rarity)), 0);
  const glowColor = RARITY_COLOR[RARITY_ORDER[best]];
  const dust = useCountUp(reveal.stardust, DEAL_AT + found * DEAL_GAP + 150, reduced);
  const rise = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    tapHaptic("success");
    if (!reduced) rise.value = withSpring(1, { damping: 14, stiffness: 130 });
  }, [rise, reduced]);
  const cardIn = useAnimatedStyle(() => ({ opacity: Math.min(1, rise.value * 1.4), transform: [{ translateY: (1 - rise.value) * 60 }, { scale: 0.92 + rise.value * 0.08 }] }));
  // One find fills the card; two sit side by side; more share a grid.
  const columns = found === 1 ? 1 : found <= 4 ? 2 : 3, art = found === 1 ? Math.min(150, width * 0.38) : found <= 2 ? 92 : found <= 4 ? 72 : 56;
  return <View style={[s.page, s.dark, { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 16) + 8 }]} testID="reveal-expedition">
    <Svg width={width} height={height * 0.6} style={s.glow} pointerEvents="none">
      <Defs><RadialGradient id="found-glow" cx="50%" cy="40%" r="60%"><Stop offset="0" stopColor={glowColor} stopOpacity={0.3} /><Stop offset="1" stopColor={glowColor} stopOpacity={0} /></RadialGradient></Defs>
      <Rect x={0} y={0} width={width} height={height * 0.6} fill="url(#found-glow)" />
    </Svg>
    <Text style={s.eyebrow}>{minutes ? `FROM YOUR ${minutes}-MINUTE WALK` : "FROM THE TRAIL"}</Text>
    <Text style={s.heading} accessibilityRole="header">{found === 1 ? "You found something" : `You found ${found} things`}</Text>
    <Animated.View style={[s.bigCard, { borderColor: glowColor + "66" }, cardIn]} testID="reveal-expedition-found">
      <ScrollView style={s.flex} contentContainerStyle={[s.finds, found === 1 && s.findsOne]} showsVerticalScrollIndicator={false} scrollEnabled={found > 4}>
        {reveal.finds.map((g, i) => <FindTile key={`${g.item}-${i}`} gift={g} index={i} art={art} columns={columns} big={found === 1} reduced={reduced} />)}
      </ScrollView>
      <View style={s.cardFoot} accessible accessibilityLabel={`${reveal.stardust} Stardust. Spend it in Outfits.`}>
        <View style={s.dustRow}><StardustArt size={22} /><Text style={s.dustBig}>{`+${dust} Stardust`}</Text></View>
        <Text style={s.note}>{"Spend Stardust in Outfits on things you haven't found yet."}</Text>
      </View>
    </Animated.View>
    <View style={s.bottomStatic}>
      <Pressable onPress={onContinue} accessibilityRole="button" accessibilityLabel="Continue" style={s.primary}><Text style={s.primaryText}>Continue</Text></Pressable>
      {!!show && <Pressable testID="expedition-view-item" onPress={() => onOutfits(show)} accessibilityRole="button" accessibilityLabel={itemDestination(show)} style={s.secondary}><Text style={s.secondaryText}>{itemDestination(show)}</Text></Pressable>}
    </View>
  </View>;
}

/** A number that counts up from zero once the finds are down. */
function useCountUp(target: number, delay: number, reduced: boolean) {
  const [shown, setShown] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced || target <= 0) return;
    let frame = 0, start = 0;
    const step = (now: number) => {
      start ||= now;
      const t = Math.min(1, (now - start) / 700);
      setShown(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(step); else tapHaptic("light");
    };
    const later = setTimeout(() => { frame = requestAnimationFrame(step); }, delay);
    return () => { clearTimeout(later); cancelAnimationFrame(frame); };
  }, [target, delay, reduced]);
  return reduced ? target : shown;
}

/** A find, dealt onto the card: it springs up with a buzz, and rare ones glow. */
function FindTile({ gift, index, art, columns, big, reduced }: { gift: Gift; index: number; art: number; columns: number; big: boolean; reduced: boolean }) {
  const item = rewardItem(gift.item);
  const deal = useSharedValue(reduced ? 1 : 0), shine = useSharedValue(0.6);
  const special = RARITY_ORDER.indexOf(gift.rarity) >= 2;
  useEffect(() => {
    if (reduced) return;
    const delay = DEAL_AT + index * DEAL_GAP;
    deal.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 150 }));
    if (special) shine.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0.45, { duration: 900 })), -1, true));
    const buzz = setTimeout(() => tapHaptic(special || gift.new ? "success" : "light"), delay + 120);
    return () => clearTimeout(buzz);
  }, [deal, shine, index, special, gift.new, reduced]);
  const dealt = useAnimatedStyle(() => ({ opacity: Math.min(1, deal.value * 1.6),
    transform: [{ translateY: (1 - deal.value) * 40 }, { scale: 0.6 + deal.value * 0.4 }, { rotate: `${(1 - deal.value) * (index % 2 ? 8 : -8)}deg` }] }));
  const glow = useAnimatedStyle(() => ({ opacity: shine.value }));
  if (!item) return null;
  const color = RARITY_COLOR[gift.rarity], box = art + (big ? 44 : 24);
  return <Animated.View style={[s.tile, { width: `${100 / columns}%` }, dealt]}
    accessible accessibilityLabel={`${item.name}, ${RARITY_NAME[gift.rarity]}${gift.new ? ", new" : `, already yours, ${gift.stardust} Stardust instead`}`}>
    <View style={[s.tileArt, { width: box, height: box, borderRadius: box / 3.2 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: box / 3.2, backgroundColor: color + (special ? "44" : "24") }, glow]} />
      <ItemArt id={gift.item} size={art} />
    </View>
    <Text style={[s.tileName, big && s.tileNameBig]} numberOfLines={2}>{item.name}</Text>
    <Text style={[s.giftRarity, big && s.rarityBig, { color }]} numberOfLines={1}>{RARITY_NAME[gift.rarity]}{big && item.set ? ` · ${SETS[item.set].name} set` : ""}</Text>
      {!gift.new && <Text style={s.giftRarity}>Already yours</Text>}
    {gift.new ? <View style={[s.newPill, big && s.pillBig]}><Text style={s.newText}>NEW</Text></View>
      : <View style={[s.dustPill, big && s.pillBig]}><StardustArt size={13} /><Text style={s.dustText}>{`+${gift.stardust}`}</Text></View>}
  </Animated.View>;
}

/** Today's trail after a session: you walk on from where you were, and the end of the trail has its own reward. */
function TrailStep({ reveal, player, onClose }: { reveal: Extract<Reveal, { kind: "expedition" }>; player: RevealPlayer; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const nothing = !reveal.finds.length;
  // A queued reveal belongs to the day and progress of its claim. A later
  // session, refresh or midnight must not retarget its walk while it is open.
  const trail = reveal.trail ?? { ...player.trail, ...player.today, nextFindSeconds: player.nextFindSeconds,
    fromSeconds: reveal.fromSeconds ?? Math.max(0, player.today.seconds - (reveal.seconds ?? 0)) };
  const walked = reveal.trail ? Math.max(0, trail.seconds - trail.fromSeconds) : reveal.seconds;
  const minutes = walked === null ? null : Math.round(walked / 60);
  return <View style={[s.page, s.dark, { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 16) + 8 }]} testID={nothing ? "reveal-expedition" : "reveal-expedition-trail"}>
    <Text style={s.eyebrow}>{minutes ? `${minutes} ${minutes === 1 ? "MINUTE" : "MINUTES"} FURTHER` : "TODAY'S TRAIL"}</Text>
    <Text style={s.heading} accessibilityRole="header">{nothing ? reveal.stardust ? `+${reveal.stardust} Stardust` : "On your way" : "Today's trail"}</Text>
    <ScrollView style={s.flex} contentContainerStyle={s.trailArea}>
      <TodayTrail fill seconds={trail.seconds} fromSeconds={trail.fromSeconds}
        findSeconds={trail.findSeconds} stops={trail.stops} finds={trail.finds} complete={trail.complete} bonus={reveal.trailStardust ?? 0}
        nextFindSeconds={trail.nextFindSeconds} pendingFinds={trail.pendingFinds} sizeKey="return" look={player.look} equipped={player.equipped} level={player.level} background={player.background} frame={player.frame} />
    </ScrollView>
    <View style={s.bottomStatic}>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Continue" style={s.primary}><Text style={s.primaryText}>Continue</Text></Pressable>
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
  const show = firstCollectible(reveal.items);
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
        {!!show && <Pressable testID="pack-view-item" onPress={() => onOutfits(show)} accessibilityRole="button" accessibilityLabel={itemDestination(show)} style={s.secondary}><Text style={s.secondaryText}>{itemDestination(show)}</Text></Pressable>}
      </> : <Pressable onPress={openIt} accessibilityRole="button" accessibilityLabel={`Open your ${name} pack`} style={[s.primary, { backgroundColor: color }]}><Text style={[s.primaryText, { color: "#14111F" }]}>Open it</Text></Pressable>}
    </View>
  </View>;
}

const s = StyleSheet.create({
  page: { flex: 1 }, flex: { flex: 1, minWidth: 0 },
  dark: { backgroundColor: "#0B0F1A", paddingHorizontal: 20 },






  bottomStatic: { gap: 4, paddingTop: 12 },

  eyebrow: { color: colors.level, fontSize: 12, letterSpacing: 1.6, fontWeight: "800", textAlign: "center" },
  heading: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "800", textAlign: "center" },




  glow: { position: "absolute", top: 0, left: 0 },
  bigCard: { flex: 1, marginTop: 18, borderRadius: 28, borderWidth: 1.5, backgroundColor: "#131A2A", overflow: "hidden" },
  finds: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignContent: "center", flexGrow: 1, paddingVertical: 18, paddingHorizontal: 8, rowGap: 18 },
  findsOne: { paddingVertical: 24 },
  tile: { alignItems: "center", gap: 4, paddingHorizontal: 4 },
  tileArt: { alignItems: "center", justifyContent: "center", marginBottom: 6, overflow: "hidden" },
  tileName: { color: colors.text, fontSize: 15, lineHeight: 19, fontWeight: "700", textAlign: "center" },
  tileNameBig: { fontSize: 26, lineHeight: 32, fontWeight: "800" },
  rarityBig: { fontSize: 15 },
  pillBig: { minHeight: 28, paddingHorizontal: 12, marginTop: 4 },
  cardFoot: { gap: 2, paddingBottom: 16, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.08)" },
  trailArea: { flexGrow: 1, paddingTop: 14 },
























  gift: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.05)" },
  giftArt: { width: 60, height: 60, borderRadius: 16, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  giftName: { color: colors.text, fontSize: 16, fontWeight: "700" },
  giftRarity: { color: colors.secondary, fontSize: 13, fontWeight: "600" },
  newPill: { paddingHorizontal: 9, minHeight: 24, borderRadius: 12, justifyContent: "center", backgroundColor: "#2DD4A7" },
  newText: { color: "#052E25", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  dustPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, minHeight: 24, borderRadius: 12, backgroundColor: "rgba(167,139,250,0.18)" },
  dustText: { color: "#DDD6FE", fontSize: 13, fontWeight: "800" },
  dustRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 14, paddingBottom: 14 },
  dustBig: { color: "#DDD6FE", fontSize: 22, fontWeight: "800", fontVariant: ["tabular-nums"] },
  packTop: { alignItems: "center", gap: 6 },
  packCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  packGifts: { alignSelf: "stretch", gap: 10 },
  sub: { color: colors.secondary, fontSize: 15, textAlign: "center" },
  note: { color: colors.secondary, fontSize: 13, lineHeight: 18, textAlign: "center", paddingHorizontal: 8 },
  primary: { minHeight: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: "700" },
  secondary: { minHeight: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: colors.neutral, fontSize: 16, fontWeight: "600" },
});
