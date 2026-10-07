import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, BackHandler, Modal, ScrollView, StyleSheet, View, useWindowDimensions, type ScrollViewProps } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import { colors } from "../constants/theme";

export const TOUR_STEPS = [
  { id: "home-identity", route: "/", title: "Welcome to LifeRPG.", body: "This is Home. Your Focus streak counts consecutive days with completed focus. Your level reflects the effort you’ve logged." },
  { id: "home-focus", route: "/", title: "Make a little space for focus.", body: "Start a focus block here. Follow a suggestion or choose free focus. Find your next step lets you change direction anytime." },
  { id: "home-quests", route: "/", title: "A place for your own quests.", body: "Create a quest for something that matters to you. Tap a quest to review its duration and Life area before starting. Quests stay alongside suggestions." },
  { id: "progress-overview", route: "/progress", title: "See where your time went.", body: "Progress brings together focus time, Life areas and session history. Your consistency shows both your current and longest Focus streak." },
  { id: "profile-areas", route: "/profile", title: "Your effort takes shape.", body: "Your Life areas grow through completed focus. They reflect practice you’ve recorded, rather than ability. Personalise your character here. You’re ready to explore." },
] as const;
const receiptKey = (owner: string) => `liferpg:tour:v1:${owner}`;
export async function prepareFeatureTour(owner: string) { if (owner) await AsyncStorage.setItem(receiptKey(owner), "pending"); }
type Rect = { x: number; y: number; width: number; height: number };
type Target = { measure: (done: (rect: Rect) => void) => void; reveal: (rect: Rect) => boolean };
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
  const { height } = useWindowDimensions();
  useEffect(() => tour?.register(id, {
    measure: done => view.current?.measureInWindow((x, y, width, measuredHeight) => done({ x, y, width, height: measuredHeight })),
    reveal: rect => {
      if (!scroll || (rect.y >= 96 && rect.y + rect.height <= height - 180)) return false;
      scroll.scroll.current?.scrollTo({ y: Math.max(0, scroll.offset.current + rect.y - 112), animated: false }); return true;
    },
  }), [id, tour, scroll, height]);
  return <View ref={view} collapsable={false}>{children}</View>;
}
export function useFeatureTour() { return useContext(TourContext); }
export function FeatureTourProvider({ children }: { children: ReactNode }) {
  const { profile } = useUser(), timer = useTimer(), router = useRouter(), pathname = usePathname();
  const owner = profile.id ?? "", eligible = profile.onboarding_completed && !timer.hasOpenSession && !timer.actionBusy && !timer.isRestoring && !timer.restoreError && !timer.rewardsVisible && !(timer.isCompleted && !timer.sessionSummary);
  const [step, setStep] = useState<number | null>(null), [rect, setRect] = useState<Rect | null>(null), [retry, setRetry] = useState(0);
  const [started, setStarted] = useState(false), [waitingExpired, setWaitingExpired] = useState(false);
  const [scope, setScope] = useState(() => ({ owner, eligible }));
  if (scope.owner !== owner || scope.eligible !== eligible) {
    setScope({ owner, eligible }); setStep(null); setRect(null); setStarted(false); setWaitingExpired(false);
  }
  const targets = useRef(new Map<string, Target>()), ownerRef = useRef(owner), advancing = useRef(false);
  const [height, setHeight] = useState(200), [opacity] = useState(() => new Animated.Value(1));
  const screen = useWindowDimensions(), insets = useSafeAreaInsets(), reduced = useReducedMotion();
  useEffect(() => { ownerRef.current = owner; }, [owner]);
  const start = useCallback(() => { if (owner && eligible) { advancing.current = false; setStarted(false); setWaitingExpired(false); setRect(null); setStep(0); router.navigate("/"); } }, [owner, eligible, router]);
  const register = useCallback((id: string, target: Target) => { targets.current.set(id, target); return () => { if (targets.current.get(id) === target) targets.current.delete(id); }; }, []);
  const value = useMemo(() => ({ register, start }), [register, start]);
  useEffect(() => {
    let live = true;
    if (owner && eligible) void AsyncStorage.getItem(receiptKey(owner)).then(receipt => { if (live && receipt === "pending") start(); }).catch(() => {});
    return () => { live = false; };
  }, [owner, eligible, start]);
  const current = step === null ? null : TOUR_STEPS[step];
  useEffect(() => {
    if (!current) return;
    if (pathname !== current.route) { router.navigate(current.route); return; }
    let live = true, attempts = 0, timeout: ReturnType<typeof setTimeout>;
    const expire = () => { advancing.current = false; setWaitingExpired(true); };
    const measure = () => {
      if (!live) return;
      const target = targets.current.get(current.id);
      if (!target) { if (++attempts < 30) timeout = setTimeout(measure, 100); else expire(); return; }
      target.measure(next => {
        if (!live || next.width <= 0 || next.height <= 0) { if (live && ++attempts < 30) timeout = setTimeout(measure, 100); else if (live) expire(); return; }
        if (attempts === 0 && target.reveal(next)) { attempts++; timeout = setTimeout(measure, 100); return; }
        const y = Math.max(insets.top + 8, next.y), bottom = Math.min(screen.height - insets.bottom - 8, next.y + next.height);
        if (bottom <= y) { if (++attempts < 30) timeout = setTimeout(measure, 100); else expire(); return; }
        advancing.current = false;
        setRect({ x: Math.max(8, next.x), y, width: Math.min(next.width, screen.width - 16), height: bottom - y });
        setStarted(true);
        AccessibilityInfo.announceForAccessibility(`${current.title} ${current.body}`);
      });
    };
    timeout = setTimeout(measure, current.id === "home-identity" ? 350 : 240);
    return () => { live = false; clearTimeout(timeout); };
  }, [current, pathname, router, screen.width, screen.height, insets.top, insets.bottom, retry]);
  useEffect(() => {
    if (!rect || reduced) { opacity.setValue(1); return; }
    opacity.setValue(0); const animation = Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }); animation.start(); return () => animation.stop();
  }, [rect, reduced, opacity]);
  const end = () => {
    setStep(null); setRect(null); router.navigate("/");
    void AsyncStorage.setItem(receiptKey(ownerRef.current), "done").catch(() => {});
  };
  const next = () => { if (advancing.current || (!rect && !waitingExpired)) return; advancing.current = true; if (step === TOUR_STEPS.length - 1) end(); else { setRect(null); setWaitingExpired(false); setStep(index => index === null ? null : index + 1); } };
  useEffect(() => { if (step === null) return; const back = BackHandler.addEventListener("hardwareBackPress", () => true); return () => back.remove(); }, [step]);
  const top = rect ? Math.max(insets.top + 12, Math.min(screen.height - insets.bottom - height - 12, rect.y > screen.height / 2 ? rect.y - height - 16 : rect.y + rect.height + 16)) : screen.height * 0.3;
  return <TourContext.Provider value={value}>{children}
    <Modal visible={step !== null && (started || !!rect || waitingExpired)} transparent animationType="none" statusBarTranslucent onRequestClose={() => {}}>
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        {rect ? <><View style={[s.dim, { top: 0, left: 0, right: 0, height: rect.y }]} /><View style={[s.dim, { top: rect.y, left: 0, width: rect.x, height: rect.height }]} /><View style={[s.dim, { top: rect.y, left: rect.x + rect.width, right: 0, height: rect.height }]} /><View style={[s.dim, { top: rect.y + rect.height, bottom: 0, left: 0, right: 0 }]} /><View pointerEvents="none" style={[s.outline, { top: rect.y - 4, left: rect.x - 4, width: rect.width + 8, height: rect.height + 8 }]} /></> : <View style={[StyleSheet.absoluteFill, s.dim]} />}
        {current && <Animated.View onLayout={event => setHeight(event.nativeEvent.layout.height)} style={[s.tip, { top, opacity }]}>
          <Text style={s.counter}>{(step ?? 0) + 1} of {TOUR_STEPS.length} · A quick look around</Text><Text style={s.title} accessibilityRole="header">{current.title}</Text>
          <ScrollView style={{ minHeight: 96, maxHeight: screen.height * 0.3 }}><Text style={s.body}>{rect ? current.body : waitingExpired ? "This section isn’t ready yet. You can retry or continue exploring." : "Opening this section…"}</Text></ScrollView>
          {waitingExpired && !rect && <Pressable onPress={() => { setWaitingExpired(false); setRetry(value => value + 1); }} accessibilityRole="button" style={s.action}><Text style={s.body}>Retry highlight</Text></Pressable>}
          <Pressable onPress={next} disabled={!rect && !waitingExpired} accessibilityRole="button" style={s.action}><Text style={s.actionText}>{step === TOUR_STEPS.length - 1 ? "Explore LifeRPG" : "Next"}</Text></Pressable>
        </Animated.View>}
      </View>
    </Modal>
  </TourContext.Provider>;
}
const s = StyleSheet.create({ dim: { position: "absolute", backgroundColor: "rgba(3,6,12,0.76)" }, outline: { position: "absolute", borderWidth: 1.5, borderColor: colors.accent, borderRadius: 20 }, tip: { position: "absolute", left: 20, right: 20, maxWidth: 480, alignSelf: "center", padding: 20, borderRadius: 24, backgroundColor: "#20283D", borderWidth: 1, borderColor: colors.line, gap: 12 }, counter: { color: colors.secondary, fontSize: 13, lineHeight: 18 }, title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "500" }, body: { color: colors.neutral, fontSize: 16, lineHeight: 24 }, action: { minHeight: 48, borderRadius: 14, backgroundColor: colors.accentSoft, padding: 12, alignItems: "center", justifyContent: "center" }, actionText: { color: colors.accent, fontSize: 16, lineHeight: 22, fontWeight: "500" } });
