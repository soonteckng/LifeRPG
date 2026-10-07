import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, BackHandler, Easing, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import { colors } from "../constants/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";

export function useOnboardingTransition() {
  const reduced = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(1));
  const [moving, setMoving] = useState(false);
  const [reveal, setReveal] = useState(0);
  const lock = useRef(false);
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; animation.current?.stop(); }; }, []);
  // Start the incoming fade after React has committed the new page, while its
  // opacity is still zero. Starting it inside the outgoing callback flashes the
  // previous page on Android when the React commit takes another frame.
  useLayoutEffect(() => {
    if (!reveal) return;
    const incoming = Animated.timing(opacity, { toValue: 1, duration: 260, easing: Easing?.out?.(Easing.cubic), useNativeDriver: true, isInteraction: false });
    animation.current = incoming;
    incoming.start(() => { if (alive.current) { opacity.setValue(1); lock.current = false; setMoving(false); } });
    return () => incoming.stop();
  }, [reveal, opacity]);
  const change = (action: () => void) => {
    if (lock.current) return;
    Keyboard.dismiss();
    if (reduced) { action(); return; }
    lock.current = true; setMoving(true);
    animation.current = Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true, isInteraction: false });
    animation.current.start(({ finished }) => {
      if (!alive.current) return;
      if (!finished) { opacity.setValue(1); lock.current = false; setMoving(false); return; }
      action();
      setReveal(value => value + 1);
    });
  };
  return { opacity, moving, change };
}

export default function OnboardingFrame({ step, total, title, subtitle, children, opacity, busy = false, primary = "Continue", onNext, onBack, secondary, onSecondary, error, retry }: {
  step: number; total: number; title: string; subtitle: string; children: ReactNode;
  opacity: Animated.Value; busy?: boolean; primary?: string; onNext: () => void;
  onBack?: () => void; secondary?: string; onSecondary?: () => void; error?: string; retry?: () => void;
}) {
  const scroll = useRef<ScrollView>(null);
  useLayoutEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [step]);
  useEffect(() => { AccessibilityInfo.announceForAccessibility(title); }, [title]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (Keyboard.isVisible()) Keyboard.dismiss();
      else if (!busy) onBack?.();
      return true;
    });
    return () => subscription.remove();
  }, [busy, onBack]);
  return <SafeAreaView style={s.page}>
    <KeyboardAvoidingView style={s.page} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={s.container}>
        <View style={s.top}><View style={s.topRow}><Text style={s.brand}>LIFERPG</Text><Text style={s.step}>Step {step} of {total}</Text></View>
          <View style={s.progress} accessible accessibilityRole="progressbar" accessibilityLabel="Setup progress" accessibilityValue={{ min: 0, max: total, now: step, text: `Step ${step} of ${total}` }}>
            {Array.from({ length: total }, (_, i) => <View key={i} style={[s.segment, i < step && s.segmentComplete]} />)}
          </View>
        </View>
        <ScrollView ref={scroll} style={s.scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity, gap: 24 }} pointerEvents={busy ? "none" : "auto"}>
            <View style={s.heading}><Text style={s.title} accessibilityRole="header">{title}</Text><Text style={s.subtitle}>{subtitle}</Text></View>{children}
          </Animated.View>
        </ScrollView>
        <View style={s.footer} testID="onboarding-footer">
          <View style={s.feedback} accessibilityLiveRegion="polite">{!!error && <Text style={s.error} accessibilityRole="alert">{error}</Text>}{retry && <Pressable onPress={retry} accessibilityRole="button" style={s.quiet}><Text style={s.link}>Retry loading preferences</Text></Pressable>}</View>
          <View style={s.footerActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous step" accessibilityState={{ disabled: busy || !onBack }} disabled={busy || !onBack} onPress={onBack} style={[s.back, (busy || !onBack) && s.disabled]}><Text style={s.link}>Back</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={primary} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onNext} style={[s.primary, busy && s.disabled]}><Text style={s.primaryText}>{primary}</Text></Pressable>
          </View>
          {onSecondary && <Pressable accessibilityRole="button" accessibilityLabel={secondary} disabled={busy} onPress={onSecondary} style={s.quiet}><Text style={s.link}>{secondary}</Text></Pressable>}
        </View>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
export function OnboardingChoice({ title, hint, selected, onPress }: { title: string; hint: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={title} accessibilityHint={hint} accessibilityState={{ checked: selected }} onPress={onPress} style={[s.choice, selected && s.choiceSelected]}>
    <View style={s.choiceDetail}><Text style={s.choiceTitle}>{title}</Text><Text style={s.choiceHint}>{hint}</Text></View><View style={[s.radio, selected && s.radioSelected]}>{selected && <View style={s.radioDot} />}</View>
  </Pressable>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background }, container: { flex: 1, width: "100%", maxWidth: 520, alignSelf: "center" },
  top: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 20, gap: 16 }, topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  brand: { fontSize: 13, lineHeight: 18, letterSpacing: 2, color: colors.secondary, fontWeight: "500" }, step: { fontSize: 14, lineHeight: 20, color: colors.secondary },
  progress: { flexDirection: "row", gap: 5 }, segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.line }, segmentComplete: { backgroundColor: colors.accent },
  scroll: { flex: 1 }, body: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24, flexGrow: 1 }, heading: { gap: 12 },
  title: { fontSize: 30, lineHeight: 37, letterSpacing: -0.7, fontWeight: "500", color: colors.text }, subtitle: { fontSize: 17, lineHeight: 25, color: colors.secondary },
  footer: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8, backgroundColor: colors.background }, feedback: { minHeight: 24, paddingBottom: 8 },
  primary: { flex: 1, minHeight: 54, borderRadius: 16, backgroundColor: "#E5E4FF", alignItems: "center", justifyContent: "center", padding: 14 }, primaryText: { color: "#171827", fontSize: 17, lineHeight: 24, fontWeight: "500", textAlign: "center" },
  footerActions: { flexDirection: "row", gap: 12, alignItems: "stretch" }, back: { minWidth: 80, minHeight: 54, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 16, alignItems: "center", justifyContent: "center" }, quiet: { minHeight: 48, justifyContent: "center", paddingVertical: 10 }, link: { color: colors.accent, fontSize: 15, lineHeight: 22 },
  disabled: { opacity: 0.6 }, error: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  choice: { padding: 16, minHeight: 78, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 16 },
  choiceSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent }, choiceDetail: { flex: 1, gap: 5 }, choiceTitle: { color: colors.text, fontSize: 17, lineHeight: 23, fontWeight: "500" }, choiceHint: { color: colors.secondary, fontSize: 15, lineHeight: 21 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.secondary, alignItems: "center", justifyContent: "center" }, radioSelected: { borderColor: colors.accent }, radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
});
