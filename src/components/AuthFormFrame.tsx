import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Animated, BackHandler, Keyboard, KeyboardAvoidingView, Platform, ScrollView, View, type LayoutChangeEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "./MotionPressable";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./AppText";
import { p } from "./PersonalUI";
import { colors } from "../constants/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { navigationTiming } from "../utils/navigationMotion";
import { authFieldScrollOffset, authKeyboardOverlap, type AuthFieldRect } from "../utils/authFormLayout";

interface FormControls {
  compact: boolean;
  tight: boolean;
  active: string | null;
  focus: (field: string) => void;
  blur: (field: string) => void;
  layout: (field: string, event: LayoutChangeEvent) => void;
}

function AuthFormContents({ children, ...controls }: FormControls & {
  children: (controls: FormControls) => ReactNode;
}) {
  return children(controls);
}

export default function AuthFormFrame({ title, description, transitionKey, hero, children, progress, onBack }: {
  title: string;
  description?: string;
  transitionKey: string;
  hero?: ReactNode;
  children: (controls: FormControls) => ReactNode;
  /** Inside the intro: the same step bar as the other intro pages. */
  progress?: { step: number; total: number };
  /** A Back control at the top, also used by the phone's Back button. */
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [height, setHeight] = useState(0);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [typing, setTyping] = useState(false);
  const [focused, setFocused] = useState<{ screen: string; field: string } | null>(null);
  const active = focused?.screen === transitionKey ? focused.field : null;
  const compact = typing || (height > 0 && height < 620);
  const tight = height > 0 && height < 380;
  const host = useRef<View>(null);
  const scroll = useRef<ScrollView>(null);
  const target = useRef<string | null>(null);
  const positions = useRef<Record<string, AuthFieldRect>>({});
  const viewport = useRef(0);
  const offset = useRef(0);
  const contentY = useRef(0);
  const formY = useRef(0);
  const keyboardTop = useRef<number | undefined>(undefined);
  const measureEpoch = useRef(0);
  const mounted = useRef(false);
  const [entrance] = useState(() => new Animated.Value(1));
  const reveal = () => {
    const field = target.current ? positions.current[target.current] : undefined;
    const rect = field ? { y: contentY.current + formY.current + field.y, height: field.height } : undefined;
    const y = authFieldScrollOffset(rect, viewport.current, offset.current);
    if (y !== offset.current) {
      offset.current = y;
      scroll.current?.scrollTo({ y, animated: false });
    }
  };
  const measureKeyboard = useCallback(() => {
    if (Platform.OS !== "android") return;
    const epoch = ++measureEpoch.current;
    host.current?.measureInWindow((_x, y, _width, measuredHeight) => {
      if (!mounted.current || epoch !== measureEpoch.current) return;
      setKeyboardInset(authKeyboardOverlap(y, measuredHeight, keyboardTop.current));
    });
  }, []);
  const invalidateMeasurements = useCallback(() => {
    mounted.current = false;
    ++measureEpoch.current;
  }, []);
  useEffect(() => {
    mounted.current = true;
    const show = (event: { endCoordinates: { screenY: number; height: number } }) => {
      keyboardTop.current = event.endCoordinates.height > 0 ? event.endCoordinates.screenY : undefined;
      setTyping(keyboardTop.current !== undefined);
      measureKeyboard();
    };
    const hide = () => {
      ++measureEpoch.current;
      keyboardTop.current = undefined;
      setTyping(false);
      setKeyboardInset(0);
      setFocused(null);
      offset.current = 0;
      scroll.current?.scrollTo({ y: 0, animated: false });
    };
    const metrics = Keyboard.metrics?.();
    if (metrics) show({ endCoordinates: metrics });
    const subscriptions = [
      Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", show),
      Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", hide),
      ...(Platform.OS === "ios" ? [Keyboard.addListener("keyboardWillChangeFrame", show)] : []),
    ];
    return () => {
      invalidateMeasurements();
      subscriptions.forEach(subscription => subscription.remove());
    };
  }, [measureKeyboard, invalidateMeasurements]);
  const layout = (field: string, event: LayoutChangeEvent) => {
    positions.current[field] = event.nativeEvent.layout;
    if (target.current === field) reveal();
  };
  const focus = (field: string) => { target.current = field; setFocused({ screen: transitionKey, field }); measureKeyboard(); reveal(); };
  const blur = (field: string) => { setFocused(current => current?.field === field ? null : current); };
  useLayoutEffect(() => {
    target.current = null;
    offset.current = 0;
    scroll.current?.scrollTo({ y: 0, animated: false });
    entrance.setValue(reducedMotion ? 1 : 0);
    if (reducedMotion) return;
    const animation = Animated.timing(entrance, { toValue: 1, ...navigationTiming(230) });
    animation.start();
    return () => animation.stop();
  }, [entrance, reducedMotion, transitionKey]);
  // The phone's Back closes the keyboard first, then goes back a step.
  const back = useRef(onBack);
  useLayoutEffect(() => { back.current = onBack; }, [onBack]);
  const hasBack = !!onBack;
  useEffect(() => {
    if (!hasBack) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (Keyboard.isVisible?.()) Keyboard.dismiss(); else back.current?.();
      return true;
    });
    return () => subscription.remove();
  }, [hasBack]);
  return <SafeAreaView edges={["top", "left", "right"]} style={p.page}>
    {(progress || onBack) && <View testID="auth-top" style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 4, gap: 14, width: "100%", maxWidth: 520, alignSelf: "center" }}>
      <View style={{ minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        {onBack ? <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}
          style={{ width: 40, height: 40, borderRadius: 20, marginLeft: -8, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable> : <View />}
        {progress && <Text style={{ fontSize: 14, lineHeight: 20, color: colors.secondary }}>Step {progress.step} of {progress.total}</Text>}
      </View>
      {progress && <View style={{ flexDirection: "row", gap: 5 }} accessible accessibilityRole="progressbar" accessibilityLabel="Setup progress"
        accessibilityValue={{ min: 0, max: progress.total, now: progress.step, text: `Step ${progress.step} of ${progress.total}` }}>
        {Array.from({ length: progress.total }, (_, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < progress.step ? colors.accent : colors.line }} />)}
      </View>}
    </View>}
    <KeyboardAvoidingView style={{ flex: 1 }}
      enabled={Platform.OS === "ios"} behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top}>
      {/* Measure this unchanged host, then shorten only its child. Measuring the
          shortened scroller would alternate between overlap and no overlap. */}
      <View ref={host} collapsable={false} testID="auth-keyboard-host" onLayout={measureKeyboard}
        style={{ flex: 1 }}>
        <View testID="auth-keyboard-inset" style={{ flex: 1, paddingBottom: keyboardInset }}>
          <ScrollView ref={scroll} style={{ flex: 1 }} testID="auth-surface"
            keyboardShouldPersistTaps="handled" keyboardDismissMode="none"
            automaticallyAdjustKeyboardInsets={false} showsVerticalScrollIndicator={false}
            bounces={false} overScrollMode="never" scrollEventThrottle={16}
            onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; }}
            onLayout={event => {
              viewport.current = event.nativeEvent.layout.height;
              setHeight(viewport.current);
              reveal();
            }}
            onContentSizeChange={reveal}
            contentContainerStyle={{ flexGrow: 1, justifyContent: compact ? "flex-start" : "center", paddingHorizontal: 24,
              paddingTop: compact ? 16 : 32, paddingBottom: typing ? 16 : Math.max(24, insets.bottom + 16) }}>
            <Animated.View testID="auth-form-content"
              onLayout={event => { contentY.current = event.nativeEvent.layout.y; reveal(); }}
              style={{ width: "100%", maxWidth: 420, alignSelf: "center", gap: compact ? 20 : 28,
                opacity: reducedMotion ? 1 : entrance,
                transform: reducedMotion ? [] : [{ translateX: entrance.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
              <View testID="auth-header" style={{ gap: compact ? 6 : 12, alignItems: "center" }}>
                {!compact && hero && <View testID="auth-hero" style={{ width: 144, height: 144, alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                  <View style={{ position: "absolute", width: 144, height: 144, borderRadius: 72, borderWidth: 1, borderColor: colors.line }} />
                  <View style={{ position: "absolute", width: 112, height: 112, borderRadius: 56, backgroundColor: colors.accentSoft }} />
                  {hero}
                  <View style={{ position: "absolute", top: 17, right: 14, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.success }} />
                </View>}
                <Text style={{ color: colors.accent, fontSize: 13, lineHeight: 18, letterSpacing: 2.4, fontWeight: "600" }}>LIFERPG</Text>
                <Text style={[p.pageTitle, { fontSize: compact ? 28 : 34, lineHeight: compact ? 35 : 42, letterSpacing: -0.8, textAlign: "center" }]}
                  accessibilityRole="header">{title}</Text>
                {!compact && description && <Text style={{ color: colors.secondary, fontSize: 16, lineHeight: 22, textAlign: "center", maxWidth: 310 }}>{description}</Text>}
              </View>
              <View testID="auth-fields"
                onLayout={event => { formY.current = event.nativeEvent.layout.y; reveal(); }}
                style={{ gap: tight ? 12 : 16 }}>
                <AuthFormContents compact={compact} tight={tight} active={active} focus={focus} blur={blur} layout={layout}>{children}</AuthFormContents>
              </View>
            </Animated.View>
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
