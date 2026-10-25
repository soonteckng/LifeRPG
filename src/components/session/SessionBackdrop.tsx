import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Animated as RNAnimated, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { cancelAnimation, Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { Text } from "../AppText";
import AdventurerWalking from "../adventurer/AdventurerBack";
import { FireGlow, Fireflies, TrailScene } from "./TrailScenes";
import { useRewards } from "../../hooks/useRewards";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { trailStops, trailZone } from "../../utils/trail";
import { RETURN_TO_CAMP_MS } from "../../services/sessionReturn";

type Phase = "setup" | "running" | "paused" | "completed" | "ended";
/** You walk from camp to your place on the road… */
export const WALK_MS = 2400;
/** …then dusk fades into night, slowly, in one go. */
export const NIGHT_FADE_MS = 2000;
/** Near the end, night fades into morning, also in one go. */
export const MORNING_FADE_MS = 2500;
/** How far through a session morning comes. */
export const MORNING_AT = 0.9;
const fill = { position: "absolute" as const, left: 0, top: 0, right: 0, bottom: 0 };

/**
 * Behind the timer, one place for the whole session. Starting (`intro`), you
 * set off from camp at dusk and walk up the road; then the dusk fades into a
 * very dark night, with only the timer bright. Near the end the night fades
 * into morning in one slow change, and a finished session stays in that
 * morning light behind its card. Ending early keeps the night.
 */
type BackdropProps = {
  phase: Phase; progress: number; walking: boolean; intro: boolean; skipToken: number; onIntroEnd: () => void;
  returning?: boolean; onReturnEnd?: () => void;
};
const isMorning = ({ phase, progress }: Pick<BackdropProps, "phase" | "progress">) => phase === "completed" || (phase !== "ended" && progress >= MORNING_AT);

export default memo(function SessionBackdrop({ phase, progress, walking, intro, skipToken, onIntroEnd, returning = false, onReturnEnd }: BackdropProps) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const rewards = useRewards({ load: false });
  const shown = phase === "running" || phase === "paused" || phase === "completed" || phase === "ended";
  const morning = isMorning({ phase, progress });
  // Invisible full-screen SVGs still incur native mount and drawing work.
  // Keep only the light on show, plus its neighbour during a crossfade.
  const [nightMounted, setNightMounted] = useState(!morning);
  const [dayMounted, setDayMounted] = useState(morning);
  const walk = useSharedValue(intro || phase === "completed" ? 0 : 1), dusk = useSharedValue(intro ? 1 : 0), day = useSharedValue(morning ? 1 : 0);
  const endRef = useRef(onIntroEnd);
  useLayoutEffect(() => { endRef.current = onIntroEnd; }, [onIntroEnd]);
  // One effect runs the setting-off: start it, or (after a skip) finish it quickly.
  const skipAtStart = useRef(skipToken);
  useLayoutEffect(() => {
    if (returning) return;
    if (phase === "completed") { walk.value = 0; dusk.value = 0; return; }
    if (reduced) { walk.value = 1; dusk.value = 0; if (intro) endRef.current(); return; }
    if (!intro) { walk.value = 1; dusk.value = 0; skipAtStart.current = skipToken; return; }
    const finish = () => endRef.current();
    if (skipToken !== skipAtStart.current) {
      // Skipping finishes the walk at once and fades to night a little quicker.
      walk.value = withTiming(1, { duration: 250 });
      dusk.value = withTiming(0, { duration: 700 }, ok => { if (ok) runOnJS(finish)(); });
      return;
    }
    walk.value = 0; dusk.value = 1;
    walk.value = withTiming(1, { duration: WALK_MS, easing: Easing.inOut(Easing.quad) });
    dusk.value = withDelay(WALK_MS, withTiming(0, { duration: NIGHT_FADE_MS, easing: Easing.inOut(Easing.quad) }, ok => { if (ok) runOnJS(finish)(); }));
  }, [intro, skipToken, reduced, walk, dusk, phase, returning]);
  useLayoutEffect(() => {
    if (!returning || phase !== "completed") return;
    let current = true;
    const finish = () => { if (current) onReturnEnd?.(); };
    walk.value = 1;
    if (reduced) { walk.value = 0; finish(); }
    else walk.value = withTiming(0, { duration: RETURN_TO_CAMP_MS, easing: Easing.inOut(Easing.quad) }, ok => {
      if (ok) runOnJS(finish)();
    });
    return () => { current = false; cancelAnimation(walk); };
  }, [returning, phase, reduced, walk, onReturnEnd]);
  useEffect(() => () => { cancelAnimation(walk); cancelAnimation(dusk); cancelAnimation(day); }, [walk, dusk, day]);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(day); day.value = morning ? 1 : 0;
      setNightMounted(!morning); setDayMounted(morning);
      return;
    }
    let current = true;
    if (morning) setDayMounted(true);
    else setNightMounted(true);
    // The native completion can already be queued for JS when End or Reduce
    // Motion changes the target. Never let that old callback remove its light.
    const settle = () => { if (!current) return; if (morning) setNightMounted(false); else setDayMounted(false); };
    day.value = withTiming(morning ? 1 : 0, { duration: MORNING_FADE_MS, easing: Easing.inOut(Easing.quad) }, ok => { if (ok) runOnJS(settle)(); });
    return () => { current = false; cancelAnimation(day); };
  }, [morning, reduced, day]);
  const size = height < 720 ? 32 : 40;
  // From big in the foreground at camp to small up the road, where you walk while you focus.
  const top = height * 0.62 - size * 1.45, big = 3.4, startTy = height * 0.93 - (top + size * 0.75 + size * 0.75 * big);
  const walker = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(walk.value, [0, 1], [startTy, 0]) }, { translateX: interpolate(walk.value, [0, 1], [-width * 0.05, 0]) },
    { scale: interpolate(walk.value, [0, 1], [big, 1]) }] }));
  const duskLayer = useAnimatedStyle(() => ({ opacity: dusk.value }));
  const dayLayer = useAnimatedStyle(() => ({ opacity: day.value }));
  if (!shown) return null;
  return <View style={StyleSheet.absoluteFill} testID="session-trail" pointerEvents="none">
    {nightMounted && <TrailScene width={width} height={height} light="night" />}
    {dayMounted && <Animated.View style={[fill, dayLayer]}><TrailScene width={width} height={height} light="morning" /></Animated.View>}
    {intro && !reduced && <Animated.View style={[fill, duskLayer]}><TrailScene width={width} height={height} light="dusk" /></Animated.View>}
    <FireGlow width={width} height={height} />
    <Fireflies width={width} height={height} active={walking && !morning} />
    <Animated.View style={[s.walker, { left: width / 2 - size / 2, top }, walker]}>
      <AdventurerWalking look={rewards.look} equipped={rewards.equipped} size={size} walking={walking || intro || returning} facing={phase === "completed" ? "camp" : "away"} />
    </Animated.View>
  </View>;
}, (previous, next) => previous.phase === next.phase && isMorning(previous) === isMorning(next)
  && previous.walking === next.walking && previous.intro === next.intro && previous.skipToken === next.skipToken
  && previous.onIntroEnd === next.onIntroEnd && previous.returning === next.returning && previous.onReturnEnd === next.onReturnEnd);

/**
 * The words while you set off, above everything (the timer waits, hidden,
 * until you're on your way). Tap anywhere to skip.
 */
export const SessionIntroWords = memo(function SessionIntroWords({ minutes, area, onSkip }: { minutes: number; area: string; onSkip: () => void }) {
  const rewards = useRewards({ load: false });
  const [fade] = useState(() => new RNAnimated.Value(1));
  useEffect(() => {
    const out = RNAnimated.timing(fade, { toValue: 0, delay: WALK_MS, duration: NIGHT_FADE_MS * 0.6, useNativeDriver: true });
    out.start();
    return () => out.stop();
  }, [fade]);
  return <RNAnimated.View style={[fill, { opacity: fade }]} testID="session-setting-off">
    <Pressable style={fill} onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip">
      <View style={s.copy} pointerEvents="none">
        <Text style={s.eyebrow}>SETTING OFF</Text>
        <Text style={s.title} numberOfLines={2}>{`Off to the ${trailZone(trailStops(rewards.today.seconds, rewards.trail?.findSeconds), rewards.trail?.stops).name}`}</Text>
        <Text style={s.detail} numberOfLines={1}>{`${minutes} min · ${area}`}</Text>
      </View>
      <Text style={s.skip}>Tap anywhere to skip</Text>
    </Pressable>
  </RNAnimated.View>;
});

const s = StyleSheet.create({
  walker: { position: "absolute", opacity: 0.95 },
  copy: { position: "absolute", top: "11%", left: 24, right: 24, alignItems: "center", gap: 6 },
  eyebrow: { color: "rgba(255,255,255,0.8)", fontSize: 13, letterSpacing: 2, fontWeight: "800" },
  title: { color: "#FFFFFF", fontSize: 30, lineHeight: 36, fontWeight: "800", textAlign: "center", textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 8 },
  detail: { color: "#F3F4F6", fontSize: 16, fontWeight: "600" },
  skip: { position: "absolute", bottom: 28, left: 0, right: 0, textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: 13 },
});
