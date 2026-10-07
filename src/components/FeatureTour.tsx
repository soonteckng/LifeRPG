import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, BackHandler, ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewProps } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { overlayRect, spotlightRect, type TourRect } from "../utils/tourGeometry";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import { colors } from "../constants/theme";

export const TOUR_STEPS = [
  { id: "home-identity", route: "/", title: "Welcome to LifeRPG.", body: "This is Home. Your streak tracks consecutive Focus days; your level grows with completed focus." },
  { id: "home-focus", route: "/", title: "A little space for focus.", body: "Start your focus block here. Change its time or Life area before starting, or continue an active session." },
  { id: "home-next-step", route: "/", title: "Find a starting point.", body: "Choose suggestions here, or return to free focus. You can change direction anytime; your quests stay yours." },
  { id: "home-quests", route: "/", title: "Make room for what matters.", body: "Add a quest for something you want to work on. Tap a quest to set up its focus session." },
  { id: "progress-overview", route: "/progress", title: "See your rhythm.", body: "Explore your focus time, history and consistency. Switch between Week and Month to see how it adds up." },
  { id: "profile-areas", route: "/profile", title: "Your effort takes shape.", body: "Completed focus grows your Life areas. Your level reflects recorded effort. Personalise your character above." },
] as const;
const receiptKey = (owner: string) => `liferpg:tour:v1:${owner}`;
export async function prepareFeatureTour(owner: string) { if (owner) await AsyncStorage.setItem(receiptKey(owner), "pending"); }
type Bounds = { top: number; bottom: number; panelHeight: number };
type Target = { measure: (done: (rect: TourRect) => void) => void; reveal: (rect: TourRect, bounds: Bounds) => boolean };
const TourContext = createContext<{ register: (id: string, target: Target) => () => void; start: () => void; reserve: number } | null>(null);
const ScrollContext = createContext<{ scroll: React.RefObject<ScrollView | null>; offset: React.RefObject<number> } | null>(null);
export const TourScrollView = forwardRef<ScrollView, ScrollViewProps>(function TourScrollView({ children, onScroll, contentContainerStyle, ...props }, forwarded) {
  const scroll = useRef<ScrollView>(null), offset = useRef(0), tour = useContext(TourContext);
  const reserved = useRef(false), beforeTour = useRef(0);
  useImperativeHandle(forwarded, () => scroll.current!);
  useLayoutEffect(() => {
    const active = !!tour?.reserve;
    if (active && !reserved.current) beforeTour.current = offset.current;
    else if (!active && reserved.current) scroll.current?.scrollTo({ y: beforeTour.current, animated: false });
    reserved.current = active;
  }, [tour?.reserve]);
  const value = useMemo(() => ({ scroll, offset }), []);
  const flat = StyleSheet.flatten?.(contentContainerStyle);
  const padding = typeof flat?.paddingBottom === "number" ? flat.paddingBottom : typeof flat?.padding === "number" ? flat.padding : 0;
  return <ScrollView {...props} contentContainerStyle={[contentContainerStyle, !!tour?.reserve && { paddingBottom: padding + tour.reserve }]} ref={scroll} scrollEventThrottle={16} onScroll={event => { offset.current = Math.max(0, event.nativeEvent.contentOffset.y); onScroll?.(event); }}><ScrollContext.Provider value={value}>{children}</ScrollContext.Provider></ScrollView>;
});
export function TourAnchor({ id, children }: { id: string; children: ReactNode }) {
  const tour = useContext(TourContext), scroll = useContext(ScrollContext), view = useRef<View>(null);
  const register = tour?.register;
  useEffect(() => register?.(id, {
    measure: done => view.current?.measureInWindow((x, y, width, height) => done({ x, y, width, height })),
    reveal: (rect, bounds) => {
      if (!scroll || (rect.y >= bounds.top && rect.y + rect.height <= bounds.bottom)) return false;
      scroll.scroll.current?.scrollTo({ y: Math.max(0, scroll.offset.current + rect.y - bounds.top - 8), animated: false });
      return true;
    },
  }), [id, register, scroll]);
  return <View ref={view} collapsable={false} style={s.anchor}>{children}</View>;
}
export function useFeatureTour() { return useContext(TourContext); }
export function FeatureTourProvider({ children }: { children: ReactNode }) {
  const { profile } = useUser(), timer = useTimer(), router = useRouter(), pathname = usePathname();
  const owner = profile.id ?? "", eligible = profile.onboarding_completed && !timer.hasOpenSession && !timer.actionBusy && !timer.isRestoring && !timer.restoreError && !timer.rewardsVisible && !(timer.isCompleted && !timer.sessionSummary);
  const [step, setStep] = useState<number | null>(null), [rect, setRect] = useState<TourRect | null>(null), [retry, setRetry] = useState(0), [waitingExpired, setWaitingExpired] = useState(false);
  const [scope, setScope] = useState(() => ({ owner, eligible }));
  if (scope.owner !== owner || scope.eligible !== eligible) { setScope({ owner, eligible }); setStep(null); setRect(null); setWaitingExpired(false); }
  const targets = useRef(new Map<string, Target>()), advancing = useRef(false), leaving = useRef(false), announced = useRef(""), alive = useRef(true), root = useRef<View>(null), epoch = useRef(0);
  const [frame, setFrame] = useState<TourRect | null>(null), [panelHeight, setPanelHeight] = useState(260);
  const [bodySize, setBodySize] = useState({ id: "", height: 96 }), [titleHeight, setTitleHeight] = useState(28);
  const [opacity] = useState(() => new Animated.Value(1)), [highlightOpacity] = useState(() => new Animated.Value(0));
  const screen = useWindowDimensions(), insets = useSafeAreaInsets(), reduced = useReducedMotion();
  const invalidate = useCallback(() => { epoch.current++; }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; invalidate(); }; }, [invalidate]);
  useLayoutEffect(() => { epoch.current++; }, [owner, eligible]);
  const start = useCallback(() => { if (owner && eligible) { epoch.current++; advancing.current = false; leaving.current = false; announced.current = ""; opacity.setValue(1); highlightOpacity.setValue(0); setWaitingExpired(false); setRect(null); setStep(0); router.navigate("/"); } }, [owner, eligible, router, opacity, highlightOpacity]);
  const register = useCallback((id: string, target: Target) => { targets.current.set(id, target); return () => { if (targets.current.get(id) === target) targets.current.delete(id); }; }, []);
  const reserve = step === null ? 0 : panelHeight + insets.bottom + 24;
  const value = useMemo(() => ({ register, start, reserve }), [register, start, reserve]);
  const measureRoot = useCallback(() => {
    root.current?.measureInWindow((x, y, width, height) => {
      if (!alive.current || ![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
      setFrame(previous => previous && previous.x === x && previous.y === y && previous.width === width && previous.height === height ? previous : { x, y, width, height });
    });
  }, []);
  useEffect(() => {
    let live = true; const request = epoch.current;
    if (owner && eligible) void AsyncStorage.getItem(receiptKey(owner)).then(receipt => { if (live && request === epoch.current && receipt === "pending") start(); }).catch(() => {});
    return () => { live = false; };
  }, [owner, eligible, start]);
  const current = step === null ? null : TOUR_STEPS[step];
  // This deadline is independent of frame/route/measurement callbacks. Controls
  // stay visible even if native never delivers any measurement at all.
  useEffect(() => {
    if (!current) return;
    const timeout = setTimeout(() => { if (alive.current) setWaitingExpired(true); }, 1400);
    return () => clearTimeout(timeout);
  }, [current, retry]);
  useLayoutEffect(() => {
    if (!current || !frame) return;
    if (pathname !== current.route) { router.navigate(current.route); return; }
    let live = true, attempts = 0, revealed = false, last: TourRect | null = null, request = 0;
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
            if (target.reveal(next, { top: frame.y + insets.top + 12, bottom: frame.y + frame.height - Math.max(insets.bottom, 12) - panelHeight - 16, panelHeight })) { again(); return; }
          }
          if (!last || Math.abs(last.y - next.y) > 1 || Math.abs(last.height - next.height) > 1 || Math.abs(last.width - next.width) > 1) { last = next; again(); return; }
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
    timeout = setTimeout(measure, current.id === "home-identity" ? 300 : pathname === "/" ? 80 : 220);
    return () => { live = false; request++; clearTimeout(timeout); clearTimeout(callbackDeadline); };
  }, [current, pathname, router, frame, insets.top, insets.bottom, retry, panelHeight, owner]);
  useLayoutEffect(() => {
    if (!current) return;
    advancing.current = false; leaving.current = false;
    opacity.setValue(reduced ? 1 : 0);
    const animation = Animated.timing(opacity, { toValue: 1, duration: reduced ? 0 : 180, useNativeDriver: true, isInteraction: false }); animation.start();
    const deadline = setTimeout(() => opacity.setValue(1), 240);
    return () => { clearTimeout(deadline); animation.stop(); };
  }, [current, reduced, opacity]);
  useEffect(() => {
    if (!rect) { highlightOpacity.setValue(0); return; }
    const animation = Animated.timing(highlightOpacity, { toValue: 1, duration: reduced ? 0 : 180, useNativeDriver: true, isInteraction: false }); animation.start(); return () => animation.stop();
  }, [rect, reduced, highlightOpacity]);
  const close = useCallback((completed = false) => {
    epoch.current++; leaving.current = false; advancing.current = false; opacity.setValue(1); setStep(null); setRect(null);
    void AsyncStorage.setItem(receiptKey(owner), completed ? "done" : "dismissed").catch(() => {});
    if (completed) router.navigate("/");
  }, [owner, router, opacity]);
  const next = () => {
    if (advancing.current) return;
    advancing.current = true; leaving.current = true; const generation = epoch.current; let finished = false;
    const advance = () => {
      if (finished || !alive.current || generation !== epoch.current) return;
      finished = true; clearTimeout(deadline);
      if (step === TOUR_STEPS.length - 1) close(true);
      else { setRect(null); setWaitingExpired(false); setStep(index => index === null ? null : index + 1); }
    };
    const deadline = setTimeout(advance, reduced ? 0 : 180);
    if (reduced) advance();
    else Animated.timing(opacity, { toValue: 0, duration: 120, useNativeDriver: true, isInteraction: false }).start(() => advance());
  };
  useEffect(() => { if (step === null) return; const back = BackHandler.addEventListener("hardwareBackPress", () => { close(); return true; }); return () => back.remove(); }, [step, close]);
  const viewport = { width: frame?.width ?? screen.width, height: frame?.height ?? screen.height };
  const panelWidth = Math.min(480, viewport.width - 40), bodyHeight = bodySize.id === current?.id ? bodySize.height : 96;
  const bodyCap = Math.max(48, Math.min(viewport.height * 0.3, viewport.height - insets.top - insets.bottom - 24 - 36 - 44 - titleHeight - 48 - 30 - (waitingExpired && !rect ? 58 : 0)));
  return <TourContext.Provider value={value}><View ref={root} testID="tour-root" collapsable={false} onLayout={measureRoot} style={s.root}>
    <View style={s.root} accessibilityElementsHidden={step !== null} importantForAccessibility={step !== null ? "no-hide-descendants" : "auto"}>{children}</View>
    {current && <View testID="tour-overlay" style={s.overlay} accessibilityViewIsModal>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {rect ? <><View style={[s.dim, { top: 0, left: 0, right: 0, height: rect.y }]} /><View style={[s.dim, { top: rect.y, left: 0, width: rect.x, height: rect.height }]} /><View style={[s.dim, { top: rect.y, left: rect.x + rect.width, right: 0, height: rect.height }]} /><View style={[s.dim, { top: rect.y + rect.height, bottom: 0, left: 0, right: 0 }]} /><Animated.View style={[s.dim, { top: rect.y, left: rect.x, width: rect.width, height: rect.height, opacity: reduced ? 0 : highlightOpacity.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} /><Animated.View testID="tour-outline" style={[s.outline, { top: rect.y, left: rect.x, width: rect.width, height: rect.height, opacity: highlightOpacity }]} /></> : <View style={[StyleSheet.absoluteFill, s.dim]} />}
      </View>
      <View testID="tour-tip" onLayout={event => setPanelHeight(event.nativeEvent.layout.height)} style={[s.tip, { width: panelWidth, left: (viewport.width - panelWidth) / 2, bottom: Math.max(insets.bottom, 12) }]}>
        <View style={s.tipHeader}><Text style={s.counter}>{(step ?? 0) + 1} of {TOUR_STEPS.length} · Quick tour</Text><Pressable accessibilityRole="button" accessibilityLabel="Close tour" onPress={() => close()} style={s.close}><Text style={s.closeText}>Close</Text></Pressable></View>
        <Animated.View style={{ opacity, gap: 10 }}><Text style={s.title} accessibilityRole="header" onLayout={event => setTitleHeight(event.nativeEvent.layout.height)}>{current.title}</Text>
          <ScrollView style={{ height: Math.min(bodyHeight, bodyCap), flexGrow: 0 }} showsVerticalScrollIndicator={bodyHeight > bodyCap}>
            <Text style={s.body} onTextLayout={event => { const height = Math.ceil(event.nativeEvent.lines.reduce((sum, line) => sum + line.height, 0)); if (height > 0) setBodySize(previous => previous.id === current.id && previous.height === height ? previous : { id: current.id, height }); }}>{current.body}</Text>
          </ScrollView>
        </Animated.View>
        {waitingExpired && !rect && <Pressable onPress={() => { setWaitingExpired(false); setRetry(value => value + 1); measureRoot(); }} accessibilityRole="button" style={s.action}><Text style={s.actionText}>Retry highlight</Text></Pressable>}
        <Pressable onPress={next} accessibilityRole="button" accessibilityLabel={step === TOUR_STEPS.length - 1 ? "Explore LifeRPG" : "Next tour tip"} style={s.action}><Text style={s.actionText}>{step === TOUR_STEPS.length - 1 ? "Explore LifeRPG" : "Next"}</Text></Pressable>
      </View>
    </View>}
  </View></TourContext.Provider>;
}
const s = StyleSheet.create({
  root: { flex: 1 }, overlay: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 1000, elevation: 24 }, anchor: { width: "100%", alignSelf: "stretch" }, dim: { position: "absolute", backgroundColor: "rgba(3,6,12,0.72)" }, outline: { position: "absolute", borderWidth: 1.5, borderColor: colors.accent, borderRadius: 18 },
  tip: { position: "absolute", padding: 18, borderRadius: 22, backgroundColor: "#20283D", borderWidth: 1, borderColor: colors.line, gap: 10 }, tipHeader: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, close: { minHeight: 44, minWidth: 48, alignItems: "center", justifyContent: "center" }, closeText: { color: colors.accent, fontSize: 14, lineHeight: 20 }, counter: { color: colors.secondary, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "500" }, body: { color: colors.neutral, fontSize: 16, lineHeight: 23 }, action: { minHeight: 48, borderRadius: 14, backgroundColor: colors.accentSoft, padding: 12, alignItems: "center", justifyContent: "center" }, actionText: { color: colors.accent, fontSize: 16, lineHeight: 22, fontWeight: "500" },
});
