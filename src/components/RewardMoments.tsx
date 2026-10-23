import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Animated, AppState, Easing, Modal, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Svg, { G, Path } from "react-native-svg";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import ItemArt from "./adventurer/ItemArt";
import ProfilePicture from "./adventurer/ProfilePicture";
import { colors } from "../constants/theme";
import { useUser } from "../context/UserContext";
import { useRewards } from "../hooks/useRewards";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { SETS, STREAK_FRAMES, rewardItem, type RewardItem } from "../services/rewardCatalog";
import { launchIntroState } from "../services/launchIntroState";
import { registerSheetActivity, useActiveSheetCount } from "../utils/sheetActivity";
import { tapHaptic } from "../utils/tapHaptics";

const RARITY_COLOR: Record<string, string> = { common: "#C2C8D8", uncommon: "#2DD4A7", rare: "#60A5FA", epic: "#A78BFA", legendary: "#FBBF24" };
const RARITY_NAME: Record<string, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary" };

/** The words for each kind of reward. */
export function momentCopy(item: RewardItem): { eyebrow: string; title: string; body: string; outfits: boolean } {
  if (item.kind === "frame") {
    const days = STREAK_FRAMES.find(f => f.id === item.id)?.days ?? 0;
    return { eyebrow: "NEW FRAME", title: `${days} days in a row!`, body: `Your picture now has the ${item.name}. It upgrades on its own as your streak grows.`, outfits: false };
  }
  if (item.kind === "pet") return { eyebrow: "NEW FRIEND", title: `${item.name} joined you`, body: `${item.hint.replace("Joins you at", "For")}. Your new friend can walk with you from Outfits.`, outfits: true };
  if (item.kind === "title") return { eyebrow: "NEW BADGE", title: item.name, body: `You own every ${item.set ? SETS[item.set].name : ""} piece. Show it under your picture from Outfits.`, outfits: true };
  const kind = item.kind === "background" ? "background" : item.kind === "decor" ? "piece for your camp" : "piece";
  return { eyebrow: "NEW FIND", title: item.name, body: `A ${RARITY_NAME[item.rarity].toLowerCase()} ${kind}${item.set ? ` from the ${SETS[item.set].name} set` : ""}.`, outfits: item.kind !== "decor" };
}

/**
 * Checks for new rewards after every session (and when the app opens), and
 * shows one pop-up for each thing earned: a find, a pet, a badge, or the next
 * streak frame. It waits for other sheets and never shows during a session.
 */
export default function RewardMoments({ insideSession }: { insideSession: boolean }) {
  const { profile } = useUser();
  const rewards = useRewards();
  const router = useRouter();
  const [activityId] = useState(() => Symbol("reward-moment"));
  const otherSheets = useActiveSheetCount(activityId);
  const introDone = useSyncExternalStore(launchIntroState.subscribe, launchIntroState.isDone, launchIntroState.isDone);
  const [active, setActive] = useState(!AppState.currentState || AppState.currentState === "active");
  useEffect(() => { const l = AppState.addEventListener("change", state => setActive(state === "active")); return () => l.remove(); }, []);

  // A finished session shows up as new XP or a new streak day: check for finds then.
  const claim = useRef(rewards.claimSessions);
  useLayoutEffect(() => { claim.current = rewards.claimSessions; });
  const progress = `${profile.id}:${profile.level}:${profile.current_xp}:${profile.streak_count}`;
  useEffect(() => { if (rewards.online && profile.id) void claim.current(); }, [rewards.online, profile.id, progress]);

  const id = rewards.moments[0];
  const item = id ? rewardItem(id) : undefined;
  const visible = !!item && !insideSession && introDone && active && (otherSheets === 0);
  useLayoutEffect(() => {
    if (!visible) return;
    return registerSheetActivity(activityId);
  }, [visible, activityId]);
  return <Modal testID="reward-moment" visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => id && rewards.dismissMoment(id)}>
    {visible && item && <Moment key={item.id} item={item} left={rewards.moments.length} level={profile.level} look={rewards.look} equipped={rewards.equipped} background={rewards.background}
      streak={profile.streak_count ?? 0}
      onClose={() => rewards.dismissMoment(item.id)}
      onOutfits={() => { rewards.dismissMoment(item.id); router.push("/outfits"); }} />}
  </Modal>;
}

function Moment({ item, left, level, look, equipped, background, streak, onClose, onOutfits }: {
  item: RewardItem; left: number; level: number; look: ReturnType<typeof useRewards>["look"]; equipped: Partial<Record<string, string>>; background: string; streak: number;
  onClose: () => void; onOutfits: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [enter] = useState(() => new Animated.Value(reduced ? 1 : 0));
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    tapHaptic("success");
    if (reduced) { enter.setValue(1); return; }
    const pop = Animated.spring(enter, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true });
    const rays = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 18000, easing: Easing.linear, useNativeDriver: true }));
    pop.start(); rays.start();
    return () => { pop.stop(); rays.stop(); };
  }, [enter, spin, reduced]);
  const copy = momentCopy(item), color = RARITY_COLOR[item.rarity];
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return <View style={[s.page, { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 16) + 8 }]} accessibilityViewIsModal onAccessibilityEscape={onClose}>
    {left > 1 && <Text style={s.count}>{`${left - 1} more after this`}</Text>}
    <View style={s.center}>
      <View style={s.hero} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Animated.View style={[s.rays, { opacity: enter, transform: [{ rotate }] }]}>
          <Svg width={300} height={300} viewBox="-150 -150 300 300"><G>
            {Array.from({ length: 12 }, (_, i) => <Path key={i} d="M-11 -40 L0 -150 L11 -40 Z" fill={color} opacity={0.16} transform={`rotate(${i * 30})`} />)}
          </G></Svg>
        </Animated.View>
        <Animated.View style={{ opacity: enter, transform: [{ scale }] }}>
          {item.kind === "frame"
            ? <ProfilePicture look={look} equipped={equipped} level={level} background={background} frame={item.id} streak={streak} size={190} />
            : <View style={[s.medal, { borderColor: color + "AA", backgroundColor: color + "1F" }]}><ItemArt id={item.id} size={124} /></View>}
        </Animated.View>
      </View>
      <View style={s.copy} accessible accessibilityLiveRegion="assertive">
        <Text style={[s.eyebrow, { color }]}>{copy.eyebrow}</Text>
        <Text style={s.title}>{copy.title}</Text>
        <Text style={s.body}>{copy.body}</Text>
      </View>
    </View>
    <View style={s.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel="Continue" onPress={onClose} style={s.primary}><Text style={s.primaryText}>Continue</Text></Pressable>
      {copy.outfits && <Pressable accessibilityRole="button" accessibilityLabel="See it in Outfits" onPress={onOutfits} style={s.secondary}><Text style={s.secondaryText}>See it in Outfits</Text></Pressable>}
    </View>
  </View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "rgba(6,9,16,0.94)", paddingHorizontal: 24 },
  count: { alignSelf: "center", color: colors.tertiary, fontSize: 13, fontWeight: "600" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 28 },
  hero: { width: 300, height: 260, alignItems: "center", justifyContent: "center" },
  rays: { position: "absolute", width: 300, height: 300, top: -20 },
  medal: { width: 176, height: 176, borderRadius: 88, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  copy: { alignItems: "center", gap: 8, maxWidth: 340 },
  eyebrow: { fontSize: 13, letterSpacing: 1.4, fontWeight: "800" },
  title: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "800", textAlign: "center" },
  body: { color: colors.secondary, fontSize: 16, lineHeight: 23, textAlign: "center" },
  actions: { gap: 10 },
  primary: { minHeight: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" },
  secondary: { minHeight: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: colors.neutral, fontSize: 16, fontWeight: "600" },
});
