import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, BackHandler, Pressable as NativePressable, ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewProps, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { overlayRect, spotlightRect, tourTipPosition, tourScrollDelta, type TourRect } from "../utils/tourGeometry";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import { guideColors } from "../constants/theme";
import { notificationOnboardingStore } from "../services/notificationOnboardingStore";
import NotificationOnboardingPrompt from "./NotificationOnboardingPrompt";

/**
 * The first-run guide. It runs once, for a new account, and cannot be skipped.
 * While it is on, the app is paused and dimmed; the one thing to press glows.
 * "info" steps glow their Next button. "tap" steps glow a real tab, and the
 * guide moves on when you open it, so you learn the tabs by using them. The
 * guide never asks you to create anything.
 */
export type TourStep = { id: string; route: string; kind: "info" | "tap"; target?: string; expect?: string; title: string; body: string; next?: string };
export const TOUR_STEPS: readonly TourStep[] = [
  { id: "welcome", route: "/", kind: "info", title: "Welcome to LifeRPG.", body: "This short guide shows you around. While it’s on, the app is paused: just follow the glowing button.", next: "Let’s go" },
  { id: "home-focus", route: "/", kind: "info", target: "home-focus", title: "Your day, in one card.", body: "Today’s goal, how far you’ve come and your streak. The green button starts your next session; Other session is for anything else." },
  { id: "home-quests", route: "/", kind: "info", target: "home-quests", title: "Your routines.", body: "Things you come back to, one tap to start. See all lists every one." },
  { id: "tap-routines", route: "/", kind: "tap", target: "tab-routines", expect: "/routines", title: "Tap Routines.", body: "Open the glowing Routines tab at the bottom." },
  { id: "routines-just-focus", route: "/routines", kind: "info", target: "routines-just-focus", title: "Just focus.", body: "Any activity, your own length. Below it, save your own routines or start from an idea." },
  { id: "tap-study", route: "/routines", kind: "tap", target: "tab-study", expect: "/study", title: "Tap Study.", body: "Open the glowing Study tab." },
  { id: "study-subjects", route: "/study", kind: "info", target: "study-subjects", title: "Your subjects and exams.", body: "Add the subjects you’re taking and tap ▶ to study one. Add an exam and it counts down here and on Home." },
  { id: "tap-squads", route: "/study", kind: "tap", target: "tab-squads", expect: "/squads", title: "Tap Squads.", body: "Open the glowing Squads tab." },
  { id: "squads-overview", route: "/squads", kind: "info", title: "Focus with friends.", body: "Start or join a squad and see each other’s week. It’s optional, whenever you’re ready." },
  { id: "tap-progress", route: "/squads", kind: "tap", target: "tab-progress", expect: "/progress", title: "Tap Progress.", body: "Open the glowing Progress tab." },
  { id: "progress-overview", route: "/progress", kind: "info", title: "See your rhythm.", body: "The time you recorded each day, by category, with your streak and milestones." },
  { id: "tap-home", route: "/progress", kind: "tap", target: "tab-index", expect: "/", title: "Tap Home.", body: "Head back to the glowing Home tab." },
  { id: "home-identity", route: "/", kind: "info", target: "home-identity", title: "You’re all set.", body: "Tap your companion for Profile and milestones. The gear opens Settings, where How LifeRPG works keeps these tips.", next: "Start using LifeRPG" },
] as const;
const receiptKey = (owner: string) => `liferpg:tour:v1:${owner}`;
const pendingOwners = new Set<string>();
export async function prepareFeatureTour(owner: string, current: () => boolean = () => true) {
  if (!owner || !current()) return;
  // The optional invitation must not prevent account setup if its own marker
  // cannot be saved. Only new-account setup prepares this guide.
  await notificationOnboardingStore.prepare(owner, current).catch(() => {});
  if (!current()) return;
  pendingOwners.add(owner); await AsyncStorage.setItem(receiptKey(owner), "pending");
}
type Bounds = { top: number; bottom: number; panelHeight: number };
type Target = { measure: (done: (rect: TourRect) => void) => void; reveal: (rect: TourRect, bounds: Bounds) => boolean };
type TourValue = { register: (id: string, target: Target) => () => void; registerScroll: (route: string, reset: () => void) => () => void; layoutChanged: (id: string) => void; start: () => void; active: boolean; targetId: string | null; previewFocus: boolean; previewLines: number; reportDock: (height: number) => void };
const TourContext = createContext<TourValue | null>(null);
const ScrollContext = createContext<{ scroll: React.RefObject<ScrollView | null>; offset: React.RefObject<number>; bottomInset: number; requestedOffset: React.RefObject<number | null> } | null>(null);
export const TourScrollView = forwardRef<ScrollView, ScrollViewProps & { tourBottomInset?: number; tourRoute?: string }>(function TourScrollView({ children, onScroll, contentContainerStyle, tourBottomInset = 0, tourRoute, ...props }, forwarded) {
  const scroll = useRef<ScrollView>(null), offset = useRef(0), tour = useContext(TourContext);
  const reserved = useRef(false), beforeTour = useRef(0), requestedOffset = useRef<number | null>(null);
  const restoredEarly = useRef(false);
  useImperativeHandle(forwarded, () => scroll.current!);
  const registerScroll = tour?.registerScroll;
  useEffect(() => {
    if (!tourRoute || !registerScroll) return;
    return registerScroll(tourRoute, () => { beforeTour.current = 0; offset.current = 0; requestedOffset.current = null; restoredEarly.current = true; scroll.current?.scrollTo({ y: 0, animated: false }); });
  }, [tourRoute, registerScroll]);
  useLayoutEffect(() => {
    const active = !!tour?.active;
    if (active && !reserved.current) { beforeTour.current = offset.current; restoredEarly.current = false; }
    else if (!active && reserved.current && !restoredEarly.current) scroll.current?.scrollTo({ y: beforeTour.current, animated: false });
    reserved.current = active;
  }, [tour?.active]);
  const value = useMemo(() => ({ scroll, offset, requestedOffset, bottomInset: tourBottomInset }), [tourBottomInset]);
  return <ScrollView {...props} contentContainerStyle={contentContainerStyle} ref={scroll} scrollEventThrottle={16} onScroll={event => { offset.current = Math.max(0, event.nativeEvent.contentOffset.y); if (requestedOffset.current !== null && Math.abs(offset.current - requestedOffset.current) < 1) requestedOffset.current = null; onScroll?.(event); }}><ScrollContext.Provider value={value}>{children}</ScrollContext.Provider></ScrollView>;
});
export function TourAnchor({ id, children, style }: { id: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const tour = useContext(TourContext), scroll = useContext(ScrollContext), view = useRef<View>(null);
  const register = tour?.register;
  const reduced = useReducedMotion();
  useEffect(() => register?.(id, {
    measure: done => view.current?.measureInWindow((x, y, width, height) => done({ x, y, width, height })),
    reveal: (rect, bounds) => {
      if (!scroll) return false;
      const delta = tourScrollDelta(rect, bounds.panelHeight, bounds.top, bounds.bottom - scroll.bottomInset, scroll.offset.current);
      const next = Math.max(0, scroll.offset.current + delta);
      if (Math.abs(next - scroll.offset.current) < 1) return false;
      // A native animated scroll owns every frame. Repeated layout callbacks
      // must not restart a command already travelling to this same position.
      if (scroll.requestedOffset.current !== null && Math.abs(next - scroll.requestedOffset.current) < 1) return true;
      scroll.requestedOffset.current = reduced ? null : next;
      scroll.scroll.current?.scrollTo({ y: next, animated: !reduced });
      return true;
    },
  }), [id, register, scroll, reduced]);
  return <View ref={view} collapsable={false} style={[s.anchor, style]} onLayout={() => tour?.layoutChanged(id)}>{children}</View>;
}
export function useFeatureTour() { return useContext(TourContext); }

export function FeatureTourProvider({ children }: { children: ReactNode }) {
  const { profile, hapticsEnabled } = useUser(), timer = useTimer({ live: false }), router = useRouter(), pathname = usePathname();
  const owner = profile.id ?? "", eligible = profile.onboarding_completed && !timer.hasOpenSession && !timer.actionBusy && !timer.isRestoring && !timer.restoreError && !timer.rewardsVisible && !(timer.isCompleted && !timer.sessionSummary);
  const [step, setStep] = useState<number | null>(null), [armed, setArmed] = useState(false), [rect, setRect] = useState<TourRect | null>(null);
  const [waited, setWaited] = useState(false), [measureRevision, setMeasureRevision] = useState(0);
  const [nudge, setNudge] = useState<{ owner: string; step: number } | null>(null);
  const [invitationRevision, setInvitationRevision] = useState(0);
  const [scope, setScope] = useState(() => ({ owner, eligible }));
  if (scope.owner !== owner || scope.eligible !== eligible) { setScope({ owner, eligible }); setStep(null); setRect(null); setWaited(false); setArmed(false); setNudge(null); }
  const targets = useRef(new Map<string, Target>()), scrollTargets = useRef(new Map<string, () => void>());
  const moving = useRef(false), alive = useRef(true), root = useRef<View>(null), epoch = useRef(0);
  const [frame, setFrame] = useState<TourRect | null>(null), [panelHeight, setPanelHeight] = useState(220), [bannerHeight, setBannerHeight] = useState(58);
  const [opacity] = useState(() => new Animated.Value(0)), [glow] = useState(() => new Animated.Value(0)), [bump] = useState(() => new Animated.Value(0));
  const screen = useWindowDimensions(), insets = useSafeAreaInsets(), reduced = useReducedMotion();
  const [dockHeight, setDockHeight] = useState(90 + insets.bottom);
  const reportDock = useCallback((height: number) => { if (Number.isFinite(height) && height > 0) setDockHeight(height); }, []);
  useEffect(() => { alive.current = true; const generation = epoch; return () => { alive.current = false; generation.current++; }; }, []);
  useLayoutEffect(() => { epoch.current++; }, [owner, eligible]);
  const current = step === null ? null : TOUR_STEPS[step];
  const start = useCallback(() => {
    if (!owner || !eligible) return;
    epoch.current++; moving.current = false; opacity.setValue(0); setRect(null); setWaited(false); setNudge(null); setArmed(true);
    router.navigate("/");
  }, [owner, eligible, router, opacity]);
  const register = useCallback((id: string, target: Target) => { targets.current.set(id, target); return () => { if (targets.current.get(id) === target) targets.current.delete(id); }; }, []);
  const registerScroll = useCallback((route: string, reset: () => void) => { scrollTargets.current.set(route, reset); return () => { if (scrollTargets.current.get(route) === reset) scrollTargets.current.delete(route); }; }, []);
  const layoutChanged = useCallback((id: string) => { if (current?.target === id && !moving.current) { setRect(null); setMeasureRevision(value => value + 1); } }, [current]);
  const active = step !== null;
  const previewFocus = armed || active;
  const previewLines = screen.fontScale > 1.2 || screen.height < 700 ? 1 : 2;
  const value = useMemo(() => ({ register, registerScroll, layoutChanged, start, active, targetId: current?.target ?? null, previewFocus, previewLines, reportDock }),
    [register, registerScroll, layoutChanged, start, active, current, previewFocus, previewLines, reportDock]);
  // Only a new account's setup leaves a pending receipt, so the guide runs once.
  useEffect(() => {
    let live = true; const request = epoch.current;
    if (owner && eligible) void Promise.resolve(pendingOwners.has(owner) ? "pending" : AsyncStorage.getItem(receiptKey(owner)))
      .then(receipt => { if (live && request === epoch.current && receipt === "pending") start(); }).catch(() => {});
    return () => { live = false; };
  }, [owner, eligible, start]);
  // Home settles first; then the welcome card appears.
  useEffect(() => {
    if (!armed) return;
    let live = true; const generation = epoch.current;
    const timeout = setTimeout(() => { if (live && alive.current && generation === epoch.current) { setArmed(false); setStep(0); } }, pathname === "/" ? 600 : 1200);
    return () => { live = false; clearTimeout(timeout); };
  }, [armed, pathname]);
  const measureRoot = useCallback(() => {
    root.current?.measureInWindow((x, y, width, height) => {
      if (!alive.current || ![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
      setFrame(previous => previous && previous.x === x && previous.y === y && previous.width === width && previous.height === height ? previous : { x, y, width, height });
    });
  }, []);
  const guideTop = insets.top + 12 + bannerHeight + 10;
  // Keep each step on its page (once per step, never in a loop). A tap step
  // moves on as soon as its tab is open.
  const steered = useRef("");
  useEffect(() => {
    if (!current || moving.current) return;
    if (current.kind === "tap" && pathname === current.expect) { advance(); return; }
    if (pathname === current.route) { steered.current = ""; return; }
    const key = `${step}:${current.route}`;
    if (steered.current === key) return;
    steered.current = key; router.navigate(current.route);
  });
  // Find the highlighted element: reveal it, wait for scrolling to settle, then outline it.
  useLayoutEffect(() => {
    if (!current?.target || !frame || pathname !== current.route) return;
    let live = true, attempts = 0, revealed = false, scrolled = false, settling = 0, stable = 0, last: TourRect | null = null, request = 0;
    let timeout: ReturnType<typeof setTimeout>, callbackDeadline: ReturnType<typeof setTimeout>;
    const again = () => { if (++attempts < 24) timeout = setTimeout(measure, 60); };
    const measure = () => {
      if (!live || moving.current) return;
      const target = targets.current.get(current.target!);
      if (!target) { again(); return; }
      const sequence = ++request;
      callbackDeadline = setTimeout(() => { if (live && sequence === request) { request++; again(); } }, 100);
      try {
        target.measure(next => {
          if (!live || moving.current || sequence !== request) return;
          clearTimeout(callbackDeadline);
          if (![next.x, next.y, next.width, next.height].every(Number.isFinite) || next.width <= 0 || next.height <= 0) { again(); return; }
          if (!revealed) {
            revealed = true;
            if (target.reveal(next, { top: frame.y + guideTop, bottom: frame.y + frame.height - 12, panelHeight: panelHeight + 8 })) { scrolled = !reduced; again(); return; }
          }
          if (scrolled) settling++;
          if (!last || Math.abs(last.x - next.x) > 1 || Math.abs(last.y - next.y) > 1 || Math.abs(last.height - next.height) > 1 || Math.abs(last.width - next.width) > 1) { last = next; stable = 0; again(); return; }
          if (scrolled && (settling < 6 || ++stable < 2)) { again(); return; }
          const local = overlayRect(next, frame);
          if (local.y + local.height <= 0 || local.y >= frame.height) { again(); return; }
          const highlight = spotlightRect(local, frame.width, frame.height);
          if (highlight.width <= 0 || highlight.height <= 0) { again(); return; }
          setRect(previous => previous && previous.x === highlight.x && previous.y === highlight.y && previous.width === highlight.width && previous.height === highlight.height ? previous : highlight);
        });
      } catch { clearTimeout(callbackDeadline); again(); }
    };
    timeout = setTimeout(measure, 60);
    return () => { live = false; request++; clearTimeout(timeout); clearTimeout(callbackDeadline); };
  }, [current, pathname, frame, guideTop, panelHeight, measureRevision, reduced]);
  // If a highlight never arrives, the card still appears, with its own button.
  useEffect(() => {
    if (!current) return;
    const timeout = setTimeout(() => { if (alive.current) setWaited(true); }, reduced ? 500 : 1000);
    return () => clearTimeout(timeout);
  }, [current, measureRevision, reduced]);
  const overview = !!current && !current.target;
  const ready = !!current && (overview ? pathname === current.route : !!rect || waited);
  useLayoutEffect(() => {
    if (!current) return;
    if (!ready) { opacity.setValue(0); return; }
    const animation = Animated.timing(opacity, { toValue: 1, duration: reduced ? 0 : 200, useNativeDriver: true, isInteraction: false });
    animation.start();
    try { AccessibilityInfo.announceForAccessibility(`${current.title} ${current.body}`); } catch { /* Spoken copy stays on screen. */ }
    return () => animation.stop();
  }, [current, ready, reduced, opacity]);
  // The thing to press glows: a slow pulse the whole time, a bump when you tap elsewhere.
  useEffect(() => {
    glow.setValue(reduced ? 1 : 0);
    if (!current || reduced) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: true, isInteraction: false }),
      Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: true, isInteraction: false }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [current, reduced, glow]);
  const paused = () => {
    if (!current) return;
    setNudge({ owner, step: step! });
    try { AccessibilityInfo.announceForAccessibility(current.kind === "tap" ? `Guide: ${current.title}` : "Guide: tap Next to continue."); } catch { /* Visible copy remains. */ }
    if (hapticsEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (reduced) return;
    bump.setValue(0);
    Animated.sequence([
      Animated.timing(bump, { toValue: 1, duration: 140, useNativeDriver: true, isInteraction: false }),
      Animated.timing(bump, { toValue: 0, duration: 260, useNativeDriver: true, isInteraction: false }),
    ]).start();
  };
  const close = useCallback(() => {
    epoch.current++; moving.current = false; setStep(null); setRect(null); setWaited(false); setNudge(null);
    pendingOwners.delete(owner);
    void AsyncStorage.setItem(receiptKey(owner), "done").catch(() => {});
    const generation = epoch.current;
    const live = () => alive.current && generation === epoch.current;
    void notificationOnboardingStore.finishGuide(owner, live).then(() => { if (live()) setInvitationRevision(value => value + 1); }).catch(() => {});
  }, [owner]);
  // One way forward: fade the card, then show the next step (or finish).
  function advance() {
    if (moving.current || step === null) return;
    moving.current = true; setNudge(null);
    const generation = epoch.current, next = step + 1;
    const done = () => {
      if (!alive.current || generation !== epoch.current) return;
      moving.current = false;
      if (next >= TOUR_STEPS.length) { scrollTargets.current.get("/")?.(); close(); return; }
      setRect(null); setWaited(false); setStep(next);
    };
    if (reduced) { opacity.setValue(0); done(); return; }
    let finished = false;
    const once = () => { if (!finished) { finished = true; done(); } };
    const fallback = setTimeout(once, 260);
    Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true, isInteraction: false }).start(() => { clearTimeout(fallback); once(); });
  }
  // Hardware Back never leaves the guide; it just points at the glow again.
  useEffect(() => {
    if (!armed && !current) return;
    const back = BackHandler.addEventListener("hardwareBackPress", () => { if (current) paused(); return true; });
    return () => back.remove();
  });
  const viewport = { width: frame?.width ?? screen.width, height: frame?.height ?? screen.height };
  const panelWidth = Math.min(480, viewport.width - 32);
  const tabTarget = !!current?.target?.startsWith("tab-");
  // Tips stay above the tab bar; for a tab, just above the glowing tab.
  const tipBottom = tabTarget && rect ? rect.y - 16 : viewport.height - dockHeight - 12;
  const tipTop = current?.id === "welcome" ? Math.max(guideTop, (viewport.height - panelHeight) / 2)
    : tourTipPosition(overview || tabTarget ? null : rect, panelHeight, guideTop, tipBottom);
  const hole = current?.kind === "tap" && rect ? rect : null;
  const fallbackTap = current?.kind === "tap" && waited && !rect;
  const nudged = !!current && nudge?.owner === owner && nudge.step === step;
  const ringStyle = (shape: TourRect) => ({ top: shape.y - 6, left: shape.x - 6, width: shape.width + 12, height: shape.height + 12,
    opacity: reduced ? 1 : glow.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
    transform: [{ scale: reduced ? 1 : Animated.add(glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }), bump.interpolate({ inputRange: [0, 1], outputRange: [0, 0.06] })) }] });
  const guideActive = armed || active;
  const counter = step === null ? 0 : step + 1;
  const tapLabel = current?.expect === "/" ? "Home" : current?.expect ? current.expect.slice(1).replace(/^./, letter => letter.toUpperCase()) : "";
  return <TourContext.Provider value={value}><View ref={root} testID="tour-root" collapsable={false} onLayout={measureRoot} style={s.root}>
    <View testID="tour-app-content" style={s.root} accessibilityElementsHidden={guideActive} importantForAccessibility={guideActive ? "no-hide-descendants" : "auto"}>{children}</View>
    <NotificationOnboardingPrompt tourActive={guideActive} revision={invitationRevision} />
    {guideActive && <View testID="tour-overlay" style={s.overlay} pointerEvents="box-none" accessibilityViewIsModal>
      {/* Everything but the glowing target is paused. A tap step leaves a hole
          over its real tab, so that one tab works and nothing else does. */}
      {hole ? <>
        <NativePressable testID="tour-paused-controls" onPress={paused} accessible={false} style={[s.block, { top: 0, left: 0, right: 0, height: hole.y }]} />
        <NativePressable onPress={paused} accessible={false} style={[s.block, { top: hole.y, left: 0, width: hole.x, height: hole.height }]} />
        <NativePressable onPress={paused} accessible={false} style={[s.block, { top: hole.y, left: hole.x + hole.width, right: 0, height: hole.height }]} />
        <NativePressable onPress={paused} accessible={false} style={[s.block, { top: hole.y + hole.height, left: 0, right: 0, bottom: 0 }]} />
      </> : <NativePressable testID="tour-paused-controls" onPress={paused} accessible={false} style={StyleSheet.absoluteFill} />}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {rect && !overview ? <>
          <View style={[s.dim, { top: 0, left: 0, right: 0, height: rect.y }]} />
          <View style={[s.dim, { top: rect.y, left: 0, width: rect.x, height: rect.height }]} />
          <View style={[s.dim, { top: rect.y, left: rect.x + rect.width, right: 0, height: rect.height }]} />
          <View style={[s.dim, { top: rect.y + rect.height, bottom: 0, left: 0, right: 0 }]} />
          <Animated.View testID="tour-outline" style={[s.ring, current?.kind === "tap" && s.ringTap, ringStyle(rect)]} />
        </> : <View testID={overview ? "tour-overview-scrim" : "tour-dim"} style={[StyleSheet.absoluteFill, overview ? s.overviewDim : s.dimFull]} />}
      </View>
      <View testID="tour-banner" pointerEvents="none" onLayout={event => { const height = event.nativeEvent.layout.height; if (Number.isFinite(height) && height > 0) setBannerHeight(height); }} style={[s.banner, { top: insets.top + 12 }]}>
        <View style={s.bannerRow}><Ionicons name="sparkles" size={15} color={guideColors.text} /><Text style={s.bannerTitle}>{armed ? "Starting your guide…" : `Guide · ${counter} of ${TOUR_STEPS.length}`}</Text></View>
        <Text style={s.bannerHint}>The app is paused · follow the glowing button</Text>
        <View style={s.track}><View style={[s.fill, { width: `${Math.round(100 * counter / TOUR_STEPS.length)}%` }]} /></View>
      </View>
      {current && <Animated.View testID="tour-tip" onLayout={event => setPanelHeight(event.nativeEvent.layout.height)}
        accessible={current.kind === "tap"} accessibilityRole={current.kind === "tap" ? "button" : undefined} accessibilityLabel={current.kind === "tap" ? `${current.title} ${current.body}` : undefined}
        accessibilityActions={current.kind === "tap" ? [{ name: "activate", label: `Open ${tapLabel}` }] : undefined}
        onAccessibilityAction={current.kind === "tap" ? () => router.navigate(current.expect!) : undefined}
        style={[s.tip, { width: panelWidth, left: (viewport.width - panelWidth) / 2, top: tipTop, opacity, transform: [{ scale: reduced ? 1 : opacity.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }] }]}>
        <Text testID="tour-title" style={s.title} accessibilityRole="header">{current.title}</Text>
        <ScrollView style={{ maxHeight: Math.max(60, viewport.height * 0.28), flexGrow: 0 }}>
          {nudged && <Text testID="tour-paused-feedback" style={s.feedback} accessibilityRole="alert">{current.kind === "tap" ? `Tap the glowing ${tapLabel} tab to continue.` : "Tap the glowing button to continue."}</Text>}
          <Text style={s.body}>{current.body}</Text>
        </ScrollView>
        {current.kind === "info" ? <View style={s.next}>
          <Animated.View testID="tour-next-ring" pointerEvents="none" style={[s.nextRing, { opacity: reduced ? 1 : glow.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
            transform: [{ scale: reduced ? 1 : Animated.add(glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }), bump.interpolate({ inputRange: [0, 1], outputRange: [0, 0.06] })) }] }]} />
          <Pressable testID="tour-next" onPress={advance} accessibilityRole="button" accessibilityLabel={current.next ?? (step === TOUR_STEPS.length - 1 ? "Done" : "Next")} style={s.action}>
            <Text style={s.actionText}>{current.next ?? "Next"}</Text><Ionicons name="arrow-forward" size={17} color={guideColors.text} />
          </Pressable>
        </View> : fallbackTap ? <Pressable testID="tour-open-tab" onPress={() => router.navigate(current.expect!)} accessibilityRole="button" accessibilityLabel={`Open ${tapLabel}`} style={s.action}>
          <Text style={s.actionText}>Open {tapLabel}</Text><Ionicons name="arrow-forward" size={17} color={guideColors.text} />
        </Pressable> : <View style={s.pointer}><Ionicons name="hand-left-outline" size={16} color={guideColors.secondary} /><Text style={s.pointerText}>Only the glowing tab works right now.</Text></View>}
      </Animated.View>}
    </View>}
  </View></TourContext.Provider>;
}
const s = StyleSheet.create({
  root: { flex: 1 }, anchor: { width: "100%", alignSelf: "stretch" },
  overlay: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 1000, elevation: 24 },
  block: { position: "absolute" },
  dim: { position: "absolute", backgroundColor: guideColors.scrim }, dimFull: { backgroundColor: guideColors.scrim }, overviewDim: { backgroundColor: "rgba(0,0,0,0.42)" },
  ring: { position: "absolute", borderWidth: 2.5, borderRadius: 22, borderColor: guideColors.action },
  ringTap: { borderWidth: 3, borderRadius: 26, backgroundColor: "rgba(245,184,75,0.14)" },
  banner: { position: "absolute", left: 16, right: 16, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, backgroundColor: guideColors.surface, gap: 4 },
  bannerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  bannerTitle: { color: guideColors.text, fontSize: 15, lineHeight: 20, fontWeight: "700" },
  bannerHint: { color: guideColors.secondary, fontSize: 13, lineHeight: 18 },
  track: { height: 4, borderRadius: 2, backgroundColor: guideColors.tag, overflow: "hidden", marginTop: 4 }, fill: { height: 4, borderRadius: 2, backgroundColor: guideColors.action },
  tip: { position: "absolute", padding: 16, borderRadius: 22, backgroundColor: guideColors.surface, borderWidth: 1, borderColor: guideColors.line, gap: 10 },
  title: { color: guideColors.text, fontSize: 21, lineHeight: 27, fontWeight: "700", letterSpacing: -0.3 },
  body: { color: guideColors.text, fontSize: 16, lineHeight: 22 },
  feedback: { color: guideColors.text, backgroundColor: guideColors.tag, padding: 10, borderRadius: 10, marginBottom: 10, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  next: { marginTop: 2 },
  nextRing: { position: "absolute", top: -5, bottom: -5, left: -5, right: -5, borderWidth: 2.5, borderRadius: 19, borderColor: guideColors.action },
  action: { minHeight: 50, borderRadius: 14, backgroundColor: guideColors.action, paddingHorizontal: 16, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  actionText: { color: guideColors.text, fontSize: 17, lineHeight: 22, fontWeight: "700" },
  pointer: { flexDirection: "row", alignItems: "center", gap: 8 }, pointerText: { color: guideColors.secondary, fontSize: 14, lineHeight: 19 },
});
