import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, BackHandler, ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewProps, type StyleProp, type ViewStyle } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { overlayRect, spotlightRect, tourTipPosition, tourScrollDelta, type TourRect } from "../utils/tourGeometry";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import { colors } from "../constants/theme";

export const TOUR_STEPS = [
  { id: "home-identity", route: "/", title: "Your day, at a glance.", body: "Home brings together your streak, level and daily goal. Each completed focus block adds to today’s progress. Tap your level to see the tier path." },
  { id: "home-focus", route: "/", title: "Your focus block.", body: "Choose your focus area and time, then start. Suggestions follow the area you choose." },
  { id: "home-next-step", route: "/", title: "Find a starting point.", body: "Suggestions use the same areas as your focus card. Free focus starts with Everyday focus; you can choose another area on Home. Your quests and progress stay yours." },
  { id: "home-quests", route: "/", title: "Make room for what matters.", body: "Add a quest for something you want to work on. Tap a quest to set up its focus session." },
  { id: "progress-overview", route: "/progress", title: "See your rhythm.", body: "Progress gathers your focus time, Focus areas and session history. Explore Week or Month, and your current and longest streaks." },
  { id: "profile-areas", route: "/profile", title: "Watch your effort grow.", body: "Personalise your companion here. This page also holds your focus areas and milestone collection. Growth reflects the effort you’ve recorded." },
] as const;
const receiptKey = (owner: string) => `liferpg:tour:v1:${owner}`;
const pendingOwners = new Set<string>();
export async function prepareFeatureTour(owner: string) { if (owner) { pendingOwners.add(owner); await AsyncStorage.setItem(receiptKey(owner), "pending"); } }
type Bounds = { top: number; bottom: number; panelHeight: number };
type Target = { measure: (done: (rect: TourRect) => void) => void; reveal: (rect: TourRect, bounds: Bounds) => boolean };
const TourContext = createContext<{ register: (id: string, target: Target) => () => void; registerScroll: (route: string, reset: () => void) => () => void; layoutChanged: (id: string) => void; start: () => void; active: boolean; targetId: string | null; previewFocus: boolean; previewLines: number; reportDock: (height: number) => void } | null>(null);
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
  const { profile } = useUser(), timer = useTimer(), router = useRouter(), pathname = usePathname();
  const owner = profile.id ?? "", eligible = profile.onboarding_completed && !timer.hasOpenSession && !timer.actionBusy && !timer.isRestoring && !timer.restoreError && !timer.rewardsVisible && !(timer.isCompleted && !timer.sessionSummary);
  const [step, setStep] = useState<number | null>(null), [rect, setRect] = useState<TourRect | null>(null), [retry, setRetry] = useState(0), [waitingExpired, setWaitingExpired] = useState(false);
  const [armed, setArmed] = useState(false), [returning, setReturning] = useState(false);
  const [scope, setScope] = useState(() => ({ owner, eligible }));
  if (scope.owner !== owner || scope.eligible !== eligible) { setScope({ owner, eligible }); setStep(null); setRect(null); setWaitingExpired(false); setArmed(false); setReturning(false); }
  const targets = useRef(new Map<string, Target>()), advancing = useRef(false), leaving = useRef(false), announced = useRef(""), alive = useRef(true), root = useRef<View>(null), epoch = useRef(0);
  const scrollTargets = useRef(new Map<string, () => void>());
  const [geometryRevision, setGeometryRevision] = useState(0);
  const [frame, setFrame] = useState<TourRect | null>(null), [panelHeight, setPanelHeight] = useState(260);
  const [bodySize, setBodySize] = useState({ id: "", height: 96 }), [titleHeight, setTitleHeight] = useState(28);
  const [opacity] = useState(() => new Animated.Value(1)), [highlightOpacity] = useState(() => new Animated.Value(0)), [sceneOpacity] = useState(() => new Animated.Value(0));
  const incomingDeadline = useRef<ReturnType<typeof setTimeout> | null>(null), incomingAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const screen = useWindowDimensions(), insets = useSafeAreaInsets(), reduced = useReducedMotion();
  const [dockHeight, setDockHeight] = useState(90 + insets.bottom);
  const reportDock = useCallback((height: number) => { if (Number.isFinite(height) && height > 0) setDockHeight(height); }, []);
  const invalidate = useCallback(() => { epoch.current++; }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; invalidate(); }; }, [invalidate]);
  useLayoutEffect(() => { epoch.current++; }, [owner, eligible]);
  const start = useCallback(() => { if (owner && eligible) { epoch.current++; advancing.current = false; leaving.current = false; announced.current = ""; opacity.setValue(0); sceneOpacity.setValue(0); highlightOpacity.setValue(0); setWaitingExpired(false); setRect(null); setReturning(false); setArmed(true); router.navigate("/"); } }, [owner, eligible, router, opacity, highlightOpacity, sceneOpacity]);
  const register = useCallback((id: string, target: Target) => { targets.current.set(id, target); return () => { if (targets.current.get(id) === target) targets.current.delete(id); }; }, []);
  const registerScroll = useCallback((route: string, reset: () => void) => { scrollTargets.current.set(route, reset); return () => { if (scrollTargets.current.get(route) === reset) scrollTargets.current.delete(route); }; }, []);
  const layoutChanged = useCallback((id: string) => { if (step !== null && TOUR_STEPS[step].id === id && !leaving.current && !returning) { setRect(null); setGeometryRevision(value => value + 1); } }, [step, returning]);
  const active = step !== null;
  const targetId = step === null ? null : TOUR_STEPS[step].id;
  // Keep one focus-card layout for the whole tour. Restore the full prompt
  // under the opaque return cover before Home becomes visible again.
  const previewFocus = (armed || active) && !returning;
  const previewLines = screen.fontScale > 1.2 || screen.height < 700 ? 1 : 2;
  const value = useMemo(() => ({ register, registerScroll, layoutChanged, start, active, targetId, previewFocus, previewLines, reportDock }), [register, registerScroll, layoutChanged, start, active, targetId, previewFocus, previewLines, reportDock]);
  useEffect(() => {
    if (!armed || pathname !== "/") return;
    const timeout = setTimeout(() => { setArmed(false); setStep(0); }, 750);
    return () => clearTimeout(timeout);
  }, [armed, pathname]);
  const measureRoot = useCallback(() => {
    root.current?.measureInWindow((x, y, width, height) => {
      if (!alive.current || ![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
      setFrame(previous => previous && previous.x === x && previous.y === y && previous.width === width && previous.height === height ? previous : { x, y, width, height });
    });
  }, []);
  useEffect(() => {
    let live = true; const request = epoch.current;
    if (owner && eligible) {
      void Promise.resolve(pendingOwners.has(owner) ? "pending" : AsyncStorage.getItem(receiptKey(owner))).then(receipt => { if (live && request === epoch.current && receipt === "pending") start(); }).catch(() => {});
    }
    return () => { live = false; };
  }, [owner, eligible, start]);
  const current = step === null ? null : TOUR_STEPS[step];
  const overviewReady = !!current && current.route !== "/" && pathname === current.route;
  useEffect(() => { if (overviewReady && current) AccessibilityInfo.announceForAccessibility(`${current.title} ${current.body}`); }, [overviewReady, current]);
  // This deadline is independent of frame/route/measurement callbacks. Controls
  // stay visible even if native never delivers any measurement at all.
  useEffect(() => {
    if (!current) return;
    const timeout = setTimeout(() => { if (alive.current) setWaitingExpired(true); }, reduced ? 500 : 900);
    return () => clearTimeout(timeout);
  }, [current, retry, geometryRevision, reduced]);
  useLayoutEffect(() => {
    if (!current || !frame || returning) return;
    if (pathname !== current.route) { router.navigate(current.route); return; }
    // Progress and Profile are page overviews, not tiny toolbar/heading targets.
    // Keep the visible page bright and leave a compact message below it.
    if (current.route !== "/") {
      return;
    }
    let live = true, attempts = 0, revealed = false, moving = false, settlingSamples = 0, stableSamples = 0, last: TourRect | null = null, request = 0;
    let timeout: ReturnType<typeof setTimeout>, callbackDeadline: ReturnType<typeof setTimeout>;
    const again = () => { if (++attempts < 20) timeout = setTimeout(measure, 60); };
    const measure = () => {
      if (!live || leaving.current) return;
      const target = targets.current.get(current.id);
      if (!target) { again(); return; }
      const sequence = ++request;
      callbackDeadline = setTimeout(() => { if (live && sequence === request) { request++; again(); } }, 100);
      try {
        target.measure(next => {
          if (!live || leaving.current || sequence !== request) return;
          clearTimeout(callbackDeadline);
          if (![next.x, next.y, next.width, next.height].every(Number.isFinite) || next.width <= 0 || next.height <= 0) { again(); return; }
          if (!revealed) {
            revealed = true;
            if (target.reveal(next, { top: frame.y + insets.top + 12, bottom: frame.y + frame.height - 12, panelHeight: panelHeight + 8 })) { moving = !reduced; again(); return; }
          }
          if (moving) settlingSamples++;
          if (!last || Math.abs(last.x - next.x) > 1 || Math.abs(last.y - next.y) > 1 || Math.abs(last.height - next.height) > 1 || Math.abs(last.width - next.width) > 1) { last = next; stableSamples = 0; again(); return; }
          // Do not attach the outline/dialog to an intermediate scroll frame.
          if (moving && (settlingSamples < 6 || ++stableSamples < 2)) { again(); return; }
          const local = overlayRect(next, frame);
          if (local.y + local.height <= 0 || local.y >= frame.height) { again(); return; }
          const highlight = spotlightRect(local, frame.width, frame.height);
          if (highlight.width <= 0 || highlight.height <= 0) { again(); return; }
          setRect(previous => previous && previous.x === highlight.x && previous.y === highlight.y && previous.width === highlight.width && previous.height === highlight.height ? previous : highlight);
          const announcement = `${owner}:${current.id}`;
          if (announced.current !== announcement) { announced.current = announcement; AccessibilityInfo.announceForAccessibility(`${current.title} ${current.body}`); }
        });
      } catch { clearTimeout(callbackDeadline); again(); }
    };
    timeout = setTimeout(measure, pathname === "/" ? 60 : 180);
    return () => { live = false; request++; clearTimeout(timeout); clearTimeout(callbackDeadline); };
  }, [current, pathname, router, frame, insets.top, insets.bottom, retry, panelHeight, owner, returning, geometryRevision, reduced]);
  useLayoutEffect(() => { advancing.current = false; leaving.current = false; }, [current]);
  useLayoutEffect(() => {
    if (!current || returning || leaving.current) return;
    if (!rect && !overviewReady && !waitingExpired) { opacity.setValue(0); return; }
    const animation = Animated.timing(opacity, { toValue: 1, duration: reduced ? 0 : 180, useNativeDriver: true, isInteraction: false }); animation.start();
    incomingAnimation.current = animation;
    Animated.timing(sceneOpacity, { toValue: 0, duration: reduced ? 0 : 240, useNativeDriver: true, isInteraction: false }).start();
    const deadline = setTimeout(() => opacity.setValue(1), 240);
    incomingDeadline.current = deadline;
    return () => { clearTimeout(deadline); animation.stop(); };
  }, [current, reduced, opacity, rect, waitingExpired, returning, sceneOpacity, overviewReady]);
  useEffect(() => {
    if (!rect) { highlightOpacity.setValue(0); return; }
    const animation = Animated.timing(highlightOpacity, { toValue: 1, duration: reduced ? 0 : 180, useNativeDriver: true, isInteraction: false }); animation.start(); return () => animation.stop();
  }, [rect, reduced, highlightOpacity]);
  const close = useCallback(() => {
    epoch.current++; leaving.current = false; advancing.current = false; opacity.setValue(1); setStep(null); setRect(null);
    setReturning(false);
    pendingOwners.delete(owner);
    void AsyncStorage.setItem(receiptKey(owner), "done").catch(() => {});
  }, [owner, opacity]);
  useEffect(() => {
    if (!returning) return;
    if (pathname !== "/") {
      scrollTargets.current.get("/")?.();
      router.navigate("/");
      const deadline = setTimeout(() => { advancing.current = false; leaving.current = false; sceneOpacity.setValue(0); opacity.setValue(1); setWaitingExpired(true); setReturning(false); }, 1200);
      return () => clearTimeout(deadline);
    }
    // Reset again once Home is attached, while the content cover is opaque.
    // Frozen native screens may defer a command sent before navigation.
    scrollTargets.current.get("/")?.();
    let live = true, done = false;
    const finish = () => { if (live && !done) { done = true; close(); } };
    const deadline = setTimeout(finish, reduced ? 0 : 650);
    const animation = Animated.timing(sceneOpacity, { toValue: 0, duration: reduced ? 0 : 350, useNativeDriver: true, isInteraction: false });
    const settle = setTimeout(() => animation.start(({ finished }) => { if (finished) finish(); }), reduced ? 0 : 120);
    return () => { live = false; clearTimeout(deadline); clearTimeout(settle); animation.stop(); };
  }, [returning, pathname, router, reduced, sceneOpacity, opacity, close]);
  const move = (direction: -1 | 1) => {
    if (advancing.current || step === null || (direction === -1 && step === 0)) return;
    if (incomingDeadline.current) clearTimeout(incomingDeadline.current);
    incomingAnimation.current?.stop();
    advancing.current = true; leaving.current = true; const generation = epoch.current; let finished = false;
    const destination = step + direction;
    const changesPage = destination === TOUR_STEPS.length || TOUR_STEPS[destination].route !== current?.route;
    const advance = () => {
      if (finished || !alive.current || generation !== epoch.current) return;
      finished = true; clearTimeout(deadline);
      if (changesPage) sceneOpacity.setValue(1);
      if (destination === TOUR_STEPS.length) { scrollTargets.current.get("/")?.(); setRect(null); setReturning(true); }
      else { setRect(null); setWaitingExpired(false); setStep(destination); }
    };
    const deadline = setTimeout(advance, reduced ? 0 : 240);
    if (reduced) advance();
    else {
      if (changesPage) Animated.timing(sceneOpacity, { toValue: 1, duration: 160, useNativeDriver: true, isInteraction: false }).start();
      Animated.timing(opacity, { toValue: 0, duration: changesPage ? 180 : 140, useNativeDriver: true, isInteraction: false }).start(() => advance());
    }
  };
  useEffect(() => { if (step === null) return; const back = BackHandler.addEventListener("hardwareBackPress", () => { if (!returning) move(-1); return true; }); return () => back.remove(); });
  const viewport = { width: frame?.width ?? screen.width, height: frame?.height ?? screen.height };
  const panelWidth = Math.min(480, viewport.width - 40), bodyHeight = bodySize.id === current?.id ? bodySize.height : 96;
  const availableHeight = viewport.height - dockHeight - 12 - (insets.top + 12);
  const bodyCap = Math.max(48, Math.min(viewport.height * 0.3, availableHeight - 28 - 18 - titleHeight - 44 - (rect ? rect.height + 14 : 0) - (waitingExpired && !rect && !overviewReady ? 58 : 0)));
  const overview = current?.route !== "/";
  const tipTop = tourTipPosition(overview ? null : rect, panelHeight, insets.top + 12, viewport.height - dockHeight - 12);
  return <TourContext.Provider value={value}><View ref={root} testID="tour-root" collapsable={false} onLayout={measureRoot} style={s.root}>
    <View style={s.root} accessibilityElementsHidden={step !== null} importantForAccessibility={step !== null ? "no-hide-descendants" : "auto"}>{children}</View>
    {current && <View testID="tour-overlay" style={s.overlay} accessibilityViewIsModal>
      <View testID="tour-content-mask" pointerEvents="none" style={[StyleSheet.absoluteFill, { bottom: dockHeight, overflow: "hidden" }]}>
        {overview ? <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(3,6,12,0.12)" }]} /> : rect ? <><View style={[s.dim, { top: 0, left: 0, right: 0, height: rect.y }]} /><View style={[s.dim, { top: rect.y, left: 0, width: rect.x, height: rect.height }]} /><View style={[s.dim, { top: rect.y, left: rect.x + rect.width, right: 0, height: rect.height }]} /><View style={[s.dim, { top: rect.y + rect.height, bottom: 0, left: 0, right: 0 }]} /><Animated.View style={[s.dim, { top: rect.y, left: rect.x, width: rect.width, height: rect.height, opacity: reduced ? 0 : highlightOpacity.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} /><Animated.View testID="tour-outline" style={[s.outline, { top: rect.y, left: rect.x, width: rect.width, height: rect.height, opacity: highlightOpacity }]} /></> : <View style={[StyleSheet.absoluteFill, s.dim]} />}
        <Animated.View testID="tour-scene-fade" style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, opacity: sceneOpacity }]} />
      </View>
      {!returning && <Animated.View testID="tour-tip" onLayout={event => setPanelHeight(event.nativeEvent.layout.height)} style={[s.tip, { width: panelWidth, left: (viewport.width - panelWidth) / 2, top: tipTop, opacity, transform: [{ scale: reduced ? 1 : opacity.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}>
        <View style={{ gap: 10 }}><View style={s.tipHeading}><Text style={[s.title, s.headingTitle]} accessibilityRole="header" onLayout={event => setTitleHeight(event.nativeEvent.layout.height)}>{current.title}</Text><Text style={s.counter}>{(step ?? 0) + 1} of {TOUR_STEPS.length}</Text></View>
          <ScrollView style={{ height: Math.min(bodyHeight, bodyCap), flexGrow: 0 }} showsVerticalScrollIndicator={bodyHeight > bodyCap}>
            <Text style={s.body} onLayout={event => { const height = Math.ceil(event.nativeEvent.layout.height); if (height > 0) setBodySize(previous => previous.id === current.id && previous.height === height ? previous : { id: current.id, height }); }}>{current.body}</Text>
          </ScrollView>
        </View>
        {waitingExpired && !rect && !overviewReady && <Pressable onPress={() => { setWaitingExpired(false); setRetry(value => value + 1); measureRoot(); }} accessibilityRole="button" style={s.action}><Text style={s.actionText}>Retry highlight</Text></Pressable>}
        <View style={s.navigation}><Pressable onPress={() => move(-1)} disabled={step === 0} accessibilityRole="button" accessibilityLabel="Previous tour tip" accessibilityState={{ disabled: step === 0 }} style={[s.previous, step === 0 && { opacity: 0.4 }]}><Text style={s.actionText}>Back</Text></Pressable><Pressable onPress={() => move(1)} accessibilityRole="button" accessibilityLabel={step === TOUR_STEPS.length - 1 ? "Explore LifeRPG" : "Next tour tip"} style={[s.action, s.next]}><Text style={s.actionText}>{step === TOUR_STEPS.length - 1 ? "Explore LifeRPG" : "Next"}</Text></Pressable></View>
      </Animated.View>}
    </View>}
  </View></TourContext.Provider>;
}
const s = StyleSheet.create({
  tipHeading: { flexDirection: "row", alignItems: "center", gap: 12 }, headingTitle: { flex: 1 },
  navigation: { flexDirection: "row", gap: 12 }, previous: { minHeight: 44, minWidth: 72, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: colors.line }, next: { flex: 1 },
  root: { flex: 1 }, overlay: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 1000, elevation: 24 }, anchor: { width: "100%", alignSelf: "stretch" }, dim: { position: "absolute", backgroundColor: "rgba(0,0,0,0.72)" }, outline: { position: "absolute", borderWidth: 1.5, borderColor: colors.accent, borderRadius: 18 },
  tip: { position: "absolute", padding: 14, borderRadius: 22, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.line, gap: 8 }, counter: { color: colors.secondary, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  title: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "500" }, body: { color: colors.neutral, fontSize: 16, lineHeight: 23 }, action: { minHeight: 44, borderRadius: 14, backgroundColor: colors.accentSoft, padding: 10, alignItems: "center", justifyContent: "center" }, actionText: { color: colors.accent, fontSize: 16, lineHeight: 22, fontWeight: "500" },
});
