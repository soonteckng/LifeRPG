import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "../MotionPressable";
import { Text } from "../AppText";
import Adventurer from "../adventurer/Adventurer";
import ProfilePicture from "../adventurer/ProfilePicture";
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
import { trailStops, trailZone, walked } from "../../utils/trail";

export interface RevealPlayer {
  look: AdventurerLook; equipped: Partial<Record<string, string>>; level: number; background: string; frame: string | null;
  today: { seconds: number; finds: number }; nextFindSeconds: number;
}
/** onOutfits gets the item to show there, so Outfits opens on its category. */
type Props<R> = { reveal: R; player: RevealPlayer; onClose: () => void; onOutfits: (item: string) => void };
const wearable = (g: Gift) => { const k = rewardItem(g.item)?.kind; return g.new && (k === "wearable" || k === "background" || k === "pet"); };
const firstWearable = (gifts: Gift[]) => gifts.find(wearable)?.item;

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
  const found = reveal.finds.length, empty = !found && reveal.stardust === 0, show = firstWearable(reveal.finds);
  const nextFind = Math.max(1, Math.ceil(player.nextFindSeconds / 60));
  if (step === "back") {
    const size = Math.min(150, width * 0.36);
    return <View style={s.page} testID="reveal-expedition">
      <CampScene width={width} height={height} />
      <View style={[s.campCopy, { top: insets.top + 40 }]}>
        <View style={s.campChip}><Ionicons name="checkmark-circle" size={15} color="#2DD4A7" /><Text style={s.campChipText}>BACK AT CAMP</Text></View>
        <Text style={s.campTitle} numberOfLines={2}>{minutes ? `${minutes} ${minutes === 1 ? "minute" : "minutes"}, done` : "Back at camp"}</Text>
        <Text style={s.campBody}>{found ? `Your pack looks heavier · ${found} ${found === 1 ? "find" : "finds"}`
          : empty ? `Nothing found this time · your next find is ${nextFind} min away` : `+${reveal.stardust} Stardust from the trail`}</Text>
      </View>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", left: width / 2 - size / 2, bottom: height * 0.13 }, walker]}>
        <Adventurer look={player.look} equipped={player.equipped} size={size} />
      </Animated.View>
      <View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        {/* A short walk with nothing to show ends here; anything found has its own page. */}
        {empty ? <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Continue" style={s.primary}><Text style={s.primaryText}>Continue</Text></Pressable>
          : <Pressable onPress={() => setStep("found")} accessibilityRole="button" accessibilityLabel="See what you found" style={s.primary}><Text style={s.primaryText}>{found ? "See what you found" : "See your trail"}</Text></Pressable>}
      </View>
    </View>;
  }
  return <FoundPage reveal={reveal} player={player} minutes={minutes} show={show} onClose={onClose} onOutfits={onOutfits} />;
}

// The found page plays in order: the heading, each find dealt in turn, the
// Stardust counting up, then you walking on along today's trail.
const DEAL_AT = 350, DEAL_GAP = 280;
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

function FoundPage({ reveal, player, minutes, show, onClose, onOutfits }: {
  reveal: Extract<Reveal, { kind: "expedition" }>; player: RevealPlayer; minutes: number | null; show: string | undefined;
  onClose: () => void; onOutfits: (item: string) => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [map, setMap] = useState(false);
  const found = reveal.finds.length;
  const best = reveal.finds.reduce((top, g) => Math.max(top, RARITY_ORDER.indexOf(g.rarity)), 0);
  const glowColor = found ? RARITY_COLOR[RARITY_ORDER[best]] : "#A78BFA";
  const dealt = DEAL_AT + found * DEAL_GAP;
  const dust = useCountUp(reveal.stardust, dealt, reduced);
  const heading = useSharedValue(reduced ? 1 : 0);
  useEffect(() => { if (!reduced) heading.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }); }, [heading, reduced]);
  const rise = useAnimatedStyle(() => ({ opacity: heading.value, transform: [{ translateY: (1 - heading.value) * 14 }] }));
  // Up to three finds share the row; more scroll sideways.
  const room = width - 40, few = found <= 3;
  const cardWidth = found === 1 ? Math.min(210, room) : few ? Math.min(168, (room - (found - 1) * 10) / Math.max(1, found)) : 132;
  return <View style={[s.page, s.dark, { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 16) + 8 }]} testID="reveal-expedition-found">
    {/* A soft glow in the colour of the best find. */}
    <Svg width={width} height={360} style={s.glow} pointerEvents="none">
      <Defs><RadialGradient id="found-glow" cx="50%" cy="22%" r="62%"><Stop offset="0" stopColor={glowColor} stopOpacity={0.28} /><Stop offset="1" stopColor={glowColor} stopOpacity={0} /></RadialGradient></Defs>
      <Rect x={0} y={0} width={width} height={360} fill="url(#found-glow)" />
    </Svg>
    <Animated.View style={rise}>
      <Text style={s.eyebrow}>{minutes ? `FROM YOUR ${minutes}-MINUTE WALK` : "FROM THE TRAIL"}</Text>
      <Text style={s.heading} accessibilityRole="header">{map ? "Today's trail" : found ? found === 1 ? "You found something" : `You found ${found} things` : "Stardust on the way"}</Text>
    </Animated.View>
    {map ? <View style={s.mapArea}>
      <TodayTrail fill seconds={player.today.seconds} finds={player.today.finds} nextFindSeconds={player.nextFindSeconds}
        look={player.look} equipped={player.equipped} level={player.level} background={player.background} frame={player.frame} />
    </View> : <View style={s.found}>
      {found > 0 && (few ? <View style={s.dealRow}>{reveal.finds.map((g, i) => <GiftCard key={`${g.item}-${i}`} gift={g} index={i} width={cardWidth} big={found === 1} reduced={reduced} />)}</View>
        : <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.giftStrip} contentContainerStyle={s.giftCards}>
          {reveal.finds.map((g, i) => <GiftCard key={`${g.item}-${i}`} gift={g} index={i} width={cardWidth} big={false} reduced={reduced} />)}
        </ScrollView>)}
      <View style={s.dustRow} accessible accessibilityLabel={`${reveal.stardust} Stardust`}>
        <StardustArt size={24} /><Text style={s.dustBig}>{`+${dust} Stardust`}</Text>
      </View>
      <TrailProgress seconds={player.today.seconds} gained={reveal.seconds ?? 0} finds={player.today.finds} player={player} delay={dealt + 300} reduced={reduced} onMap={() => setMap(true)} />
    </View>}
    <View style={s.bottomStatic}>
      {map ? <Pressable onPress={() => setMap(false)} accessibilityRole="button" accessibilityLabel="Back to your finds" style={s.primary}><Text style={s.primaryText}>Back</Text></Pressable>
        : <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Continue" style={s.primary}><Text style={s.primaryText}>Continue</Text></Pressable>}
      {!map && !!show && <Pressable onPress={() => onOutfits(show)} accessibilityRole="button" accessibilityLabel="See it in Outfits" style={s.secondary}><Text style={s.secondaryText}>See it in Outfits</Text></Pressable>}
    </View>
  </View>;
}

/** A number that counts up from zero once the cards are down. */
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

/** A find, dealt onto the table: it springs up, and rare ones glow. */
function GiftCard({ gift, index, width, big, reduced }: { gift: Gift; index: number; width: number; big: boolean; reduced: boolean }) {
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
  const cardStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, deal.value * 1.6),
    transform: [{ translateY: (1 - deal.value) * 46 }, { scale: 0.7 + deal.value * 0.3 }, { rotate: `${(1 - deal.value) * (index % 2 ? 7 : -7)}deg` }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: shine.value }));
  if (!item) return null;
  const color = RARITY_COLOR[gift.rarity], art = big ? 92 : 60;
  return <Animated.View style={[s.card, { width, borderColor: color + "88" }, big && s.cardBig, cardStyle]}
    accessible accessibilityLabel={`${item.name}, ${RARITY_NAME[gift.rarity]}${gift.new ? ", new" : `, already yours, ${gift.stardust} Stardust instead`}`}>
    <View style={[s.cardArt, { width: art + 28, height: art + 28, borderRadius: (art + 28) / 3.2 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: (art + 28) / 3.2, backgroundColor: color + (special ? "40" : "22") }, glowStyle]} />
      <ItemArt id={gift.item} size={art} />
    </View>
    <Text style={[s.cardName, big && s.cardNameBig]} numberOfLines={2}>{item.name}</Text>
    <Text style={[s.giftRarity, { color }]} numberOfLines={1}>{RARITY_NAME[gift.rarity]}{big && item.set ? ` · ${SETS[item.set].name} set` : ""}</Text>
    {gift.new ? <View style={s.newPill}><Text style={s.newText}>NEW</Text></View>
      : <View style={s.dustPill}><StardustArt size={13} /><Text style={s.dustText}>{`+${gift.stardust}`}</Text></View>}
  </Animated.View>;
}

/**
 * Today's trail as one line: camp to your next find. You walk on from where
 * this session began to where you are now.
 */
function TrailProgress({ seconds, gained, finds, player, delay, reduced, onMap }: {
  seconds: number; gained: number; finds: number; player: RevealPlayer; delay: number; reduced: boolean; onMap: () => void;
}) {
  const [track, setTrack] = useState(0);
  const minutes = Math.max(0, seconds) / 60, end = (Math.floor(minutes / 25) + 1) * 25;
  const from = Math.max(0, minutes - Math.max(0, gained) / 60) / end, to = minutes / end;
  const walk = useSharedValue(reduced ? to : from);
  useEffect(() => {
    if (reduced) { walk.value = to; return; }
    walk.value = from;
    walk.value = withDelay(delay, withTiming(to, { duration: 1300, easing: Easing.inOut(Easing.cubic) }));
  }, [walk, from, to, delay, reduced]);
  const fill = useAnimatedStyle(() => ({ width: walk.value * track }));
  const you = useAnimatedStyle(() => ({ transform: [{ translateX: walk.value * track - 20 }] }));
  const zone = trailZone(trailStops(seconds)), toNext = Math.max(1, Math.ceil(player.nextFindSeconds / 60));
  const stops = Array.from({ length: end / 25 }, (_, i) => (i + 1) * 25);
  return <View style={s.trail} accessible accessibilityLabel={`Today's trail: ${walked(seconds)} walked, ${finds} ${finds === 1 ? "find" : "finds"}. Next find in ${toNext} minutes, in ${zone.name}.`}>
    <View style={s.trailHead}>
      <Text style={[s.trailZone, { color: zone.color }]}>{zone.name.toUpperCase()}</Text>
      <Pressable onPress={onMap} accessibilityRole="button" accessibilityLabel="See today's trail map" hitSlop={10} style={s.trailLink}>
        <Text style={s.trailLinkText}>Map</Text><Ionicons name="chevron-forward" size={14} color={colors.secondary} />
      </Pressable>
    </View>
    <View style={s.trailLine} onLayout={e => setTrack(e.nativeEvent.layout.width)}>
      <View style={s.trailTrack} />
      <Animated.View style={[s.trailFill, fill]} />
      {track > 0 && stops.map(stop => {
        const reached = stop <= minutes, left = (stop / end) * track;
        return <View key={stop} style={[s.trailStop, { left: left - 9 }, reached ? s.trailStopReached : s.trailStopNext]}>
          {reached ? <StardustArt size={10} /> : <Ionicons name="gift-outline" size={10} color={colors.secondary} />}
        </View>;
      })}
      <View style={[s.trailCamp]}><Ionicons name="bonfire" size={11} color="#04211D" /></View>
      {track > 0 && <Animated.View style={[s.trailYou, you]} pointerEvents="none">
        <ProfilePicture look={player.look} equipped={player.equipped} level={player.level} background={player.background} frame={player.frame} size={40} showLevel={false} />
      </Animated.View>}
    </View>
    <View style={s.trailFoot}>
      <Text style={s.trailStat}><Text style={s.trailStrong}>{walked(seconds)}</Text> walked today</Text>
      <Text style={s.trailStat}><Text style={s.trailStrong}>{`${toNext} min`}</Text> to the next find</Text>
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
        {!!firstWearable(reveal.items) && <Pressable onPress={() => onOutfits(firstWearable(reveal.items)!)} accessibilityRole="button" accessibilityLabel="See it in Outfits" style={s.secondary}><Text style={s.secondaryText}>See it in Outfits</Text></Pressable>}
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
  bottomStatic: { gap: 4, paddingTop: 12 },
  scroll: { gap: 14, paddingBottom: 16 },
  eyebrow: { color: colors.level, fontSize: 12, letterSpacing: 1.6, fontWeight: "800", textAlign: "center" },
  heading: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "800", textAlign: "center" },
  sub: { color: colors.secondary, fontSize: 15, textAlign: "center" },
  gifts: { gap: 8 },
  giftStrip: { flexGrow: 0, marginTop: 14, marginHorizontal: -20 },
  giftCards: { gap: 10, paddingHorizontal: 20 },
  glow: { position: "absolute", top: 0, left: 0 },
  found: { flex: 1, justifyContent: "center", gap: 6 },
  mapArea: { flex: 1, paddingTop: 14 },
  dealRow: { flexDirection: "row", justifyContent: "center", gap: 10 },
  card: { alignItems: "center", gap: 4, paddingVertical: 14, paddingHorizontal: 10, borderRadius: 22, borderWidth: 1.5, backgroundColor: "#131A2A" },
  cardBig: { paddingVertical: 20, gap: 6 },
  cardArt: { alignItems: "center", justifyContent: "center", marginBottom: 4, overflow: "hidden" },
  cardName: { color: colors.text, fontSize: 14, lineHeight: 18, fontWeight: "700", textAlign: "center" },
  cardNameBig: { fontSize: 20, lineHeight: 25 },
  trail: { gap: 12, padding: 16, borderRadius: 22, backgroundColor: "#121827", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  trailHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  trailZone: { fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  trailLink: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 32 },
  trailLinkText: { color: colors.secondary, fontSize: 14, fontWeight: "600" },
  trailLine: { height: 44, justifyContent: "center", marginHorizontal: 10 },
  trailTrack: { position: "absolute", left: 0, right: 0, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.10)" },
  trailFill: { position: "absolute", left: 0, height: 6, borderRadius: 3, backgroundColor: colors.level },
  trailStop: { position: "absolute", width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  trailStopReached: { backgroundColor: "#2A2140", borderColor: "#A78BFA" },
  trailStopNext: { backgroundColor: "#121827", borderColor: "rgba(255,255,255,0.35)", borderStyle: "dashed" },
  trailCamp: { position: "absolute", left: -10, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#14B8A6" },
  trailYou: { position: "absolute", left: 0, top: 2 },
  trailFoot: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  trailStat: { flexShrink: 1, color: colors.secondary, fontSize: 13, lineHeight: 18 },
  trailStrong: { color: colors.text, fontWeight: "700" },
  gift: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.05)" },
  giftArt: { width: 60, height: 60, borderRadius: 16, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  giftName: { color: colors.text, fontSize: 16, fontWeight: "700" },
  giftRarity: { fontSize: 13, fontWeight: "600" },
  newPill: { paddingHorizontal: 9, minHeight: 24, borderRadius: 12, justifyContent: "center", backgroundColor: "#2DD4A7" },
  newText: { color: "#052E25", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  dustPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, minHeight: 24, borderRadius: 12, backgroundColor: "rgba(167,139,250,0.18)" },
  dustText: { color: "#DDD6FE", fontSize: 13, fontWeight: "800" },
  dustRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 14, paddingBottom: 14 },
  dustBig: { color: "#DDD6FE", fontSize: 22, fontWeight: "800", fontVariant: ["tabular-nums"] },
  packTop: { alignItems: "center", gap: 6 },
  packCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  packGifts: { alignSelf: "stretch", gap: 10 },
  note: { color: colors.secondary, fontSize: 13, lineHeight: 18, textAlign: "center", paddingHorizontal: 8 },
  primary: { minHeight: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: "700" },
  secondary: { minHeight: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: colors.neutral, fontSize: 16, fontWeight: "600" },
});
