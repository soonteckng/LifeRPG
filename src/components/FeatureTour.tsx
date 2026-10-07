import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, BackHandler, Modal, ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewProps } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { overlayRect, spotlightRect, tourTipPosition, type TourRect } from "../utils/tourGeometry";
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
const TourContext = createContext<{ register: (id: string, target: Target) => () => void; start: () => void } | null>(null);
const ScrollContext = createContext<{ scroll: React.RefObject<ScrollView | null>; offset: React.RefObject<number> } | null>(null);
export const TourScrollView = forwardRef<ScrollView, ScrollViewProps>(function TourScrollView({ children, onScroll, ...props }, forwarded) {
  const scroll = useRef<ScrollView>(null), offset = useRef(0);
  useImperativeHandle(forwarded, () => scroll.current!);
  const value = useMemo(() => ({ scroll, offset }), []);
  return <ScrollView {...props} ref={scroll} scrollEventThrottle={16} onScroll={event => { offset.current = Math.max(0, event.nativeEvent.contentOffset.y); onScroll?.(event); }}><ScrollContext.Provider value={value}>{children}</ScrollContext.Provider></ScrollView>;
});
export function TourAnchor({ id, children }: { id: string; children: ReactNode }) {
  const tour = useContext(TourContext), scroll = useContext(ScrollContext), view = useRef<View>(null);
  useEffect(() => tour?.register(id, {
    measure: done => view.current?.measureInWindow((x, y, width, height) => done({ x, y, width, height })),
    reveal: (rect, bounds) => {
      const spaceAbove = rect.y - bounds.top, spaceBelow = bounds.bottom - rect.y - rect.height;
      if (!scroll || (spaceAbove >= 0 && spaceBelow >= 0 && Math.max(spaceAbove, spaceBelow) >= bounds.panelHeight + 16)) return false;
      scroll.scroll.current?.scrollTo({ y: Math.max(0, scroll.offset.current + rect.y - bounds.top - 8), animated: false });
      return true;
    },
  }), [id, tour, scroll]);
  return <View ref={view} collapsable={false} style={s.anchor}>{children}</View>;
}
export function useFeatureTour() { return useContext(TourContext); }
export function FeatureTourProvider({ children }: { children: ReactNode }) {
  const { profile } = useUser(), timer = useTimer(), router = useRouter(), pathname = usePathname();
  const owner = profile.id ?? "", eligible = profile.onboarding_completed && !timer.hasOpenSession && !timer.actionBusy && !timer.isRestoring && !timer.restoreError && !timer.rewardsVisible && !(timer.isCompleted && !timer.sessionSummary);
  const [step, setStep] = useState<number | null>(null), [rect, setRect] = useState<TourRect | null>(null), [retry, setRetry] = useState(0), [waitingExpired, setWaitingExpired] = useState(false);
  const [scope, setScope] = useState(() => ({ owner, eligible }));
  if (scope.owner !== owner || scope.eligible !== eligible) { setScope({ owner, eligible }); setStep(null); setRect(null); setWaitingExpired(false); }
  const targets = useRef(new Map<string, Target>()), advancing = useRef(false), leaving = useRef(false), announced = useRef(""), alive = useRef(true), overlay = useRef<View>(null);
  const [frame, setFrame] = useState<TourRect | null>(null), [panelHeight, setPanelHeight] = useState(250);
  const [bodySize, setBodySize] = useState({ id: "", height: 96 });
  const [headerHeight, setHeaderHeight] = useState(56), [actionHeight, setActionHeight] = useState(48);
  const [opacity] = useState(() => new Animated.Value(0)), [dimOpacity] = useState(() => new Animated.Value(0));
  const screen = useWindowDimensions(), insets = useSafeAreaInsets(), reduced = useReducedMotion();
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const start = useCallback(() => { if (owner && eligible) { advancing.current = false; leaving.current = false; announced.current = ""; opacity.setValue(0); dimOpacity.setValue(0); setWaitingExpired(false); setRect(null); setStep(0); router.navigate("/"); } }, [owner, eligible, router, opacity, dimOpacity]);
  const register = useCallback((id: string, target: Target) => { targets.current.set(id, target); return () => { if (targets.current.get(id) === target) targets.current.delete(id); }; }, []);
  const value = useMemo(() => ({ register, start }), [register, start]);
  const measureOverlay = useCallback(() => {
    overlay.current?.measureInWindow((x, y, width, height) => {
      if (!alive.current || width <= 0 || height <= 0) return;
      setFrame(previous => previous && previous.x === x && previous.y === y && previous.width === width && previous.height === height ? previous : { x, y, width, height });
    });
  }, []);
  useEffect(() => {
    let live = true;
    if (owner && eligible) void AsyncStorage.getItem(receiptKey(owner)).then(receipt => { if (live && receipt === "pending") start(); }).catch(() => {});
    return () => { live = false; };
  }, [owner, eligible, start]);
  const current = step === null ? null : TOUR_STEPS[step];
  useEffect(() => {
    if (!current || !frame) return;
    if (pathname !== current.route) { router.navigate(current.route); return; }
    let live = true, attempts = 0, revealed = false, last: TourRect | null = null, timeout: ReturnType<typeof setTimeout>;
    const expire = () => { advancing.current = false; setWaitingExpired(true); };
    const again = () => { if (++attempts < 40) timeout = setTimeout(measure, 60); else expire(); };
    const measure = () => {
      if (!live || leaving.current) return;
      const target = targets.current.get(current.id);
      if (!target) { again(); return; }
      target.measure(next => {
        if (!live || leaving.current) return;
        if (next.width <= 0 || next.height <= 0) { again(); return; }
        if (!revealed) {
          revealed = true;
          if (target.reveal(next, { top: frame.y + insets.top + 12, bottom: frame.y + frame.height - insets.bottom - 12, panelHeight })) { again(); return; }
        }
        if (!last || Math.abs(last.y - next.y) > 1 || Math.abs(last.height - next.height) > 1 || Math.abs(last.width - next.width) > 1) { last = next; again(); return; }
        const local = overlayRect(next, frame);
        if (local.y + local.height <= 0 || local.y >= frame.height) { again(); return; }
        const highlight = spotlightRect(local, frame.width, frame.height);
        setRect(previous => previous && previous.x === highlight.x && previous.y === highlight.y && previous.width === highlight.width && previous.height === highlight.height ? previous : highlight);
        advancing.current = false;
        const announcement = `${owner}:${current.id}`;
        if (announced.current !== announcement) { announced.current = announcement; AccessibilityInfo.announceForAccessibility(`${current.title} ${current.body}`); }
      });
    };
    timeout = setTimeout(measure, current.id === "home-identity" ? 300 : pathname === "/" ? 80 : 220);
    return () => { live = false; clearTimeout(timeout); };
  }, [current, pathname, router, frame, insets.top, insets.bottom, retry, panelHeight, owner]);
  useEffect(() => {
    if (step === null) { dimOpacity.setValue(0); return; }
    const animation = Animated.timing(dimOpacity, { toValue: 1, duration: reduced ? 0 : 180, useNativeDriver: true, isInteraction: false }); animation.start(); return () => animation.stop();
  }, [step, reduced, dimOpacity]);
  useEffect(() => {
    if (!rect && !waitingExpired) return;
    opacity.setValue(reduced ? 1 : 0);
    if (reduced) return;
    const animation = Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true, isInteraction: false }); animation.start(); return () => animation.stop();
  }, [rect, waitingExpired, reduced, opacity]);
  const next = () => {
    if (advancing.current || (!rect && !waitingExpired)) return;
    advancing.current = true; leaving.current = true;
    const advance = () => {
      if (!alive.current) return;
      leaving.current = false;
      if (step === TOUR_STEPS.length - 1) {
        setStep(null); setRect(null); router.navigate("/"); void AsyncStorage.setItem(receiptKey(owner), "done").catch(() => {});
      } else { setRect(null); setWaitingExpired(false); setStep(index => index === null ? null : index + 1); }
    };
    if (reduced) { opacity.setValue(0); advance(); }
    else Animated.timing(opacity, { toValue: 0, duration: 120, useNativeDriver: true, isInteraction: false }).start(({ finished }) => { if (finished) advance(); else { advancing.current = false; leaving.current = false; } });
  };
  useEffect(() => { if (step === null) return; const back = BackHandler.addEventListener("hardwareBackPress", () => true); return () => back.remove(); }, [step]);
  const viewport = { width: frame?.width ?? screen.width, height: frame?.height ?? screen.height, top: insets.top, bottom: insets.bottom };
  const position = tourTipPosition(rect, panelHeight, viewport);
  const bodyHeight = bodySize.id === current?.id ? bodySize.height : 96;
  const bodyCap = Math.max(48, Math.min(viewport.height * 0.3, viewport.height - insets.top - insets.bottom - 24 - 36 - headerHeight - actionHeight - 20 - (waitingExpired && !rect ? 58 : 0)));
  return <TourContext.Provider value={value}>{children}
    <Modal visible={step !== null} transparent animationType="none" statusBarTranslucent onShow={measureOverlay} onRequestClose={() => {}}>
      <View ref={overlay} collapsable={false} onLayout={measureOverlay} style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: dimOpacity }]}>
          {rect ? <><View style={[s.dim, { top: 0, left: 0, right: 0, height: rect.y }]} /><View style={[s.dim, { top: rect.y, left: 0, width: rect.x, height: rect.height }]} /><View style={[s.dim, { top: rect.y, left: rect.x + rect.width, right: 0, height: rect.height }]} /><View style={[s.dim, { top: rect.y + rect.height, bottom: 0, left: 0, right: 0 }]} /><Animated.View pointerEvents="none" style={[s.dim, { top: rect.y, left: rect.x, width: rect.width, height: rect.height, opacity: reduced ? 0 : opacity.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} /><Animated.View testID="tour-outline" style={[s.outline, { top: rect.y, left: rect.x, width: rect.width, height: rect.height, opacity }]} /></> : <View style={[StyleSheet.absoluteFill, s.dim]} />}
        </Animated.View>
        {current && <Animated.View testID="tour-tip" pointerEvents={rect || waitingExpired ? "auto" : "none"} onLayout={event => setPanelHeight(event.nativeEvent.layout.height)} style={[s.tip, position, { opacity: rect || waitingExpired ? opacity : 0 }]}>
          <View style={{ gap: 10 }} onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}><Text style={s.counter}>{(step ?? 0) + 1} of {TOUR_STEPS.length} · A quick welcome</Text><Text style={s.title} accessibilityRole="header">{current.title}</Text></View>
          <ScrollView style={{ height: Math.min(bodyHeight, bodyCap), flexGrow: 0 }} showsVerticalScrollIndicator={bodyHeight > bodyCap}>
            <Text style={s.body} onTextLayout={event => { const height = Math.ceil(event.nativeEvent.lines.reduce((sum, line) => sum + line.height, 0)); if (height > 0) setBodySize(previous => previous.id === current.id && previous.height === height ? previous : { id: current.id, height }); }}>{waitingExpired && !rect ? "This section isn’t ready yet. Retry the highlight or continue exploring." : current.body}</Text>
          </ScrollView>
          {waitingExpired && !rect && <Pressable onPress={() => { opacity.setValue(0); setWaitingExpired(false); setRetry(value => value + 1); }} accessibilityRole="button" style={s.action}><Text style={s.actionText}>Retry highlight</Text></Pressable>}
          <Pressable onLayout={event => setActionHeight(event.nativeEvent.layout.height)} onPress={next} disabled={!rect && !waitingExpired} accessibilityRole="button" style={s.action}><Text style={s.actionText}>{step === TOUR_STEPS.length - 1 ? "Explore LifeRPG" : "Next"}</Text></Pressable>
        </Animated.View>}
      </View>
    </Modal>
  </TourContext.Provider>;
}
const s = StyleSheet.create({
  anchor: { width: "100%", alignSelf: "stretch" }, dim: { position: "absolute", backgroundColor: "rgba(3,6,12,0.72)" }, outline: { position: "absolute", borderWidth: 1.5, borderColor: colors.accent, borderRadius: 18 },
  tip: { position: "absolute", padding: 18, borderRadius: 22, backgroundColor: "#20283D", borderWidth: 1, borderColor: colors.line, gap: 10 }, counter: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "500" }, body: { color: colors.neutral, fontSize: 16, lineHeight: 23 }, action: { minHeight: 48, borderRadius: 14, backgroundColor: colors.accentSoft, padding: 12, alignItems: "center", justifyContent: "center" }, actionText: { color: colors.accent, fontSize: 16, lineHeight: 22, fontWeight: "500" },
});
