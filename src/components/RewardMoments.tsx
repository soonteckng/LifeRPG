import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Animated, AppState, Easing, Modal, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
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
import { sessionRevealHost } from "../services/sessionReturn";
import { registerSheetActivity, useActiveSheetCount } from "../utils/sheetActivity";
import { tapHaptic } from "../utils/tapHaptics";
import { ExpeditionReveal, PackReveal } from "./rewards/RevealScreens";
import { RARITY_COLOR as RARITY_COLORS } from "./rewards/rarity";
import { useOfflineSyncPresentation } from "../hooks/useOfflineSyncPresentation";

const RARITY_COLOR = RARITY_COLORS;
const SETTLE_MS = 450;
const RARITY_NAME: Record<string, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic", legendary: "Legendary" };
function pendingTrailKey(account: string, today: { seconds: number; pendingFinds?: number; date?: string } | undefined, packDay?: string) {
  return (today?.pendingFinds ?? 0) > 0 ? `${account}:${today?.date ?? packDay ?? ""}:${today!.seconds}:${today!.pendingFinds}` : null;
}

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
 * Checks for new rewards after every session (and when the app opens). Coming
 * back from a session, or opening today's pack, shows its own screen first;
 * then one pop-up for each other thing earned: a pet, a badge, or the next
 * streak frame. It waits for other sheets and never shows during a session.
 */
export default function RewardMoments({ insideSession, claimKey = null, sessionRoute = false, claimsPaused = false }: {
  insideSession: boolean; claimKey?: string | null;
  /** One offline catch-up owns claims until its combined return is closed. */
  claimsPaused?: boolean;
  /** On the session screen, which shows a session's return screen itself (after its result card). */
  sessionRoute?: boolean;
}) {
  const { profile } = useUser();
  const rewards = useRewards();
  const sync = useOfflineSyncPresentation(rewards.owner && rewards.backendId ? { ownerId: rewards.owner, backendId: rewards.backendId } : null);
  const router = useRouter();
  const [activityId] = useState(() => Symbol("reward-moment"));
  const otherSheets = useActiveSheetCount(activityId);
  const introDone = useSyncExternalStore(launchIntroState.subscribe, launchIntroState.isDone, launchIntroState.isDone);
  const [active, setActive] = useState(!AppState.currentState || AppState.currentState === "active");
  useEffect(() => { const l = AppState.addEventListener("change", state => setActive(state === "active")); return () => l.remove(); }, []);

  // A finished session shows up as new XP or a new streak day: check for finds then.
  const claim = useRef(rewards.claimSessions);
  useLayoutEffect(() => { claim.current = rewards.claimSessions; });
  const account = `${rewards.owner ?? profile.id}:${rewards.admissionEpoch ?? 0}`;
  const progress = `${account}:${profile.level}:${profile.current_xp}:${profile.streak_count}`;
  const pendingFinds = pendingTrailKey(account, rewards.today, rewards.pack?.date);
  const checked = useRef<{ progress: string | null; session: string | null; pending: string | null }>({ progress: null, session: null, pending: null });
  const backlogFollowups = useRef(new Set<string>());
  const forcedPending = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [claimAttempt, retryClaim] = useState(0);
  useEffect(() => {
    // An app-open claim or another reward action can still be in flight when
    // completion arrives. Leave that trigger pending, then check once the
    // shared mutation lock clears. Do not drop it or retry failed HTTP calls.
    if (!rewards.online) { checked.current = { progress: null, session: null, pending: null }; forcedPending.current = null; return; }
    if (claimsPaused) return;
    if (!active || !profile.id || rewards.owner && rewards.owner !== profile.id || rewards.busy) return;
    const session = claimKey ? `${account}:${claimKey}` : null;
    const pending = !!pendingFinds && checked.current.pending !== pendingFinds;
    const newSession = !!session && checked.current.session !== session;
    const followup = !!pendingFinds && forcedPending.current === pendingFinds;
    if (!newSession && checked.current.progress === progress && !pending && !followup) return;
    const rememberFollowup = (key: string) => {
      backlogFollowups.current.add(key);
      if (backlogFollowups.current.size > 64) backlogFollowups.current.delete(backlogFollowups.current.values().next().value!);
    };
    // The first check may already know about a pending stop from the phone
    // cache. Only a subsequent check consumes that stop's bounded follow-up.
    if (pendingFinds && checked.current.progress?.startsWith(`${account}:`)) rememberFollowup(pendingFinds);
    forcedPending.current = null;
    // One catch-up for a distinct server-reported pending stop (for example
    // after the first 50 old sessions). Never poll or loop on an HTTP failure.
    checked.current = { progress, session: session ?? checked.current.session, pending: pendingFinds ?? checked.current.pending };
    void claim.current().then(result => {
      if (!mounted.current || !checked.current.progress?.startsWith(`${account}:`)) return;
      if (result.ok && result.value?.sessions?.length === 50) {
        const key = pendingTrailKey(account, result.value.state?.today, result.value.state?.pack?.date);
        if (key && !backlogFollowups.current.has(key)) {
          rememberFollowup(key); forcedPending.current = key; retryClaim(attempt => attempt + 1);
        }
      }
      if (mounted.current && !result.ok && result.message === "One moment, still saving." && checked.current.progress === progress) {
        checked.current = { progress: null, session: null, pending: null }; retryClaim(attempt => attempt + 1);
      }
    });
  }, [active, rewards.online, rewards.busy, rewards.owner, profile.id, account, progress, claimKey, claimAttempt, pendingFinds, claimsPaused]);

  const reveal = rewards.reveals[0];
  const returnMembers = reveal?.kind === "expedition" ? reveal.sessions?.map(session => session.sessionId)
    ?? (reveal.id.startsWith("return:") ? reveal.id.slice(7).split(",") : []) : [];
  const alreadyWalked = returnMembers.length > 0 && returnMembers.every(id => sync.acknowledgedReceiptIds.includes(id));
  const quietReturn = !!reveal && reveal.kind === "expedition" && alreadyWalked && !reveal.finds.length;
  useEffect(() => { if (quietReturn && reveal) rewards.dismissReveal(reveal.id); }, [quietReturn, reveal, rewards]);
  const id = reveal ? undefined : rewards.moments[0];
  const item = id ? rewardItem(id) : undefined;
  // Wait a moment once everything else has closed, so a celebration that
  // opens right after the session card (like the daily goal) goes first.
  const key = reveal?.id ?? id ?? null;
  // "See it in Outfits" from the finds card steps away to Outfits and comes
  // back to the same card afterwards; the card waits while you're there.
  const pathname = usePathname();
  const [away, setAway] = useState<{ id: string; arrived: boolean } | null>(null);
  if (away && !away.arrived && pathname === "/outfits") setAway({ ...away, arrived: true });
  if (away && (away.arrived ? pathname !== "/outfits" : away.id !== reveal?.id)) setAway(null);
  useEffect(() => {
    if (!away || away.arrived) return;
    const giveUp = setTimeout(() => setAway(null), 1500);
    return () => clearTimeout(giveUp);
  }, [away]);
  const hostedBySession = useSyncExternalStore(sessionRevealHost.subscribe, sessionRevealHost.snapshot, sessionRevealHost.snapshot);
  const heldBySession = reveal?.kind === "expedition" && (sessionRoute || hostedBySession === reveal.id);
  const wanted = !!key && (!!reveal || !!item) && !quietReturn && !insideSession && !heldBySession && introDone && active && otherSheets === 0 && !(away && away.id === key);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  useEffect(() => {
    if (!wanted || readyFor === key) return;
    const later = setTimeout(() => setReadyFor(key), SETTLE_MS);
    return () => clearTimeout(later);
  }, [wanted, key, readyFor]);
  const visible = wanted && readyFor === key;
  useLayoutEffect(() => {
    if (!visible) return;
    return registerSheetActivity(activityId);
  }, [visible, activityId]);
  const player = { look: rewards.look, equipped: rewards.equipped, level: profile.level, background: rewards.background, frame: rewards.frame,
    today: rewards.today, nextFindSeconds: rewards.nextFindSeconds, trail: rewards.trail };
  // "See it in Outfits" opens Outfits on that item's own category, previewing it.
  const showInOutfits = (item: string) => router.push({ pathname: "/outfits", params: { show: item } });
  const closeReveal = (show: string | null) => { if (!reveal) return; rewards.dismissReveal(reveal.id); if (show) showInOutfits(show); };
  return <Modal testID="reward-moment" visible={visible} transparent animationType="fade" statusBarTranslucent
    onRequestClose={() => { if (reveal) closeReveal(null); else if (id) rewards.dismissMoment(id); }}>
    {visible && reveal && (reveal.kind === "pack"
      ? <PackReveal key={reveal.id} reveal={reveal} player={player} onClose={() => closeReveal(null)} onOutfits={closeReveal} />
      : <ExpeditionReveal key={reveal.id} reveal={alreadyWalked ? { ...reveal, skipTrail: true } : reveal} player={player} onClose={() => closeReveal(null)}
        onOutfits={show => { setAway({ id: reveal.id, arrived: false }); showInOutfits(show); }} />)}
    {visible && !reveal && item && <Moment key={item.id} item={item} left={rewards.moments.length} level={profile.level} look={rewards.look} equipped={rewards.equipped} background={rewards.background}
      streak={profile.streak_count ?? 0}
      onClose={() => rewards.dismissMoment(item.id)}
      onOutfits={() => { rewards.dismissMoment(item.id); showInOutfits(item.id); }} />}
  </Modal>;
}

export function Moment({ item, left, level, look, equipped, background, streak, onClose, onOutfits }: {
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
      {(copy.outfits || item.kind === "decor") && <Pressable testID="reward-view-item" accessibilityRole="button"
        accessibilityLabel={item.kind === "decor" ? "View in Collection" : "See it in Outfits"} onPress={onOutfits} style={s.secondary}>
        <Text style={s.secondaryText}>{item.kind === "decor" ? "View in Collection" : "See it in Outfits"}</Text>
      </Pressable>}
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
