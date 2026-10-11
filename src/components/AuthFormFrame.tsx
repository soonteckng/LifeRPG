import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Animated, KeyboardAvoidingView, Platform, ScrollView, View, type LayoutChangeEvent } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./AppText";
import { p } from "./PersonalUI";
import { colors } from "../constants/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { navigationTiming } from "../utils/navigationMotion";
import { authFieldScrollOffset, type AuthFieldRect } from "../utils/authFormLayout";

interface FormControls {
  compact: boolean;
  tight: boolean;
  focus: (field: string) => void;
  layout: (field: string, event: LayoutChangeEvent) => void;
}

// Keep the render callback at a component boundary. Its controls are event
// handlers only; rendering the form never reads the scrolling refs.
function AuthFormContents({ children, ...controls }: FormControls & {
  children: (controls: FormControls) => ReactNode;
}) {
  return children(controls);
}

export default function AuthFormFrame({ title, description, transitionKey, hero, children }: {
  title: string;
  description?: string;
  transitionKey: string;
  hero?: ReactNode;
  children: (controls: FormControls) => ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [height, setHeight] = useState(0);
  const compact = height > 0 && height < 600;
  const tight = height > 0 && height < 420;
  const scroll = useRef<ScrollView>(null);
  const target = useRef<string | null>(null);
  const positions = useRef<Record<string, AuthFieldRect>>({});
  const viewport = useRef(0);
  const offset = useRef(0);
  const formY = useRef(0);
  const [entrance] = useState(() => new Animated.Value(1));
  const reveal = () => {
    const field = target.current ? positions.current[target.current] : undefined;
    const rect = field ? { y: formY.current + field.y, height: field.height } : undefined;
    const y = authFieldScrollOffset(rect, viewport.current, offset.current);
    if (y !== offset.current) {
      offset.current = y;
      scroll.current?.scrollTo({ y, animated: false });
    }
  };
  const layout = (field: string, event: LayoutChangeEvent) => {
    positions.current[field] = event.nativeEvent.layout;
    if (target.current === field) reveal();
  };
  const focus = (field: string) => { target.current = field; reveal(); };
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
  return <SafeAreaView edges={["top", "left", "right"]} style={p.page}>
    <KeyboardAvoidingView style={{ flex: 1 }}
      enabled={Platform.OS === "ios"} behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top}>
      {/* Android already resizes this window in app.json. A second JS height
          subtraction would push the fields too high and create a keyboard gap. */}
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
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24,
          paddingTop: 20, paddingBottom: compact ? 16 : Math.max(24, insets.bottom + 12) }}>
        <Animated.View testID="auth-form-content"
          onLayout={event => { formY.current = event.nativeEvent.layout.y; reveal(); }}
          style={{ width: "100%", maxWidth: 440, alignSelf: "center", gap: tight ? 10 : 16,
            opacity: reducedMotion ? 1 : entrance,
            transform: reducedMotion ? [] : [{ translateX: entrance.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
          <View style={{ gap: compact ? 8 : 12, paddingBottom: compact ? 2 : 12 }}>
            <Text style={[p.label, { fontSize: 13, letterSpacing: 2.2 }]}>LIFERPG</Text>
            {!compact && hero && <View style={{ marginTop: 6, marginBottom: 8 }}>{hero}</View>}
            <Text style={[p.pageTitle, { fontSize: tight ? 27 : 34, lineHeight: tight ? 33 : 41 }]}
              accessibilityRole="header">{title}</Text>
            {!tight && description && <Text style={[p.body, { color: colors.secondary }]}>{description}</Text>}
          </View>
          <AuthFormContents compact={compact} tight={tight} focus={focus} layout={layout}>{children}</AuthFormContents>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
