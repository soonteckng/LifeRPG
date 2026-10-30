import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import AppHeader from "./AppHeader";
import { colors } from "../constants/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { navigationTiming } from "../utils/navigationMotion";

/**
 * A whole page that rises from the bottom, like the session timer: it slides
 * up over the tabs, and the down chevron, a swipe down anywhere (once its
 * content is scrolled to the top) or the phone's Back slides it away again,
 * exactly like the session. One smooth ease, no bounce.
 * `gone` slides it away on its own, when there is nothing left to show.
 */
export default function SlideUpPage({ title, action, footer, fallback, gone = false, children }: {
  title: string; action?: ReactNode; footer?: ReactNode; fallback: string; gone?: boolean; children: ReactNode;
}) {
  const navigation = useNavigation(), router = useRouter(), reduced = useReducedMotion();
  const { height } = useWindowDimensions(), insets = useSafeAreaInsets();
  const [motion] = useState(() => new Animated.Value(reduced ? 1 : 0));
  const [leaving, setLeaving] = useState(false);
  const closing = useRef(false), offset = useRef(0);
  useLayoutEffect(() => {
    if (closing.current) return;
    const animation = Animated.timing(motion, { toValue: 1, ...navigationTiming(reduced ? 0 : 260) });
    animation.start();
    return () => animation.stop();
  }, [motion, reduced]);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(motion, { toValue: 0, ...navigationTiming(reduced ? 0 : 240) }).start(({ finished }) => {
      if (!finished) { closing.current = false; motion.setValue(1); return; }
      setLeaving(true);
    });
  }, [motion, reduced]);
  useEffect(() => { if (gone) close(); }, [gone, close]);
  // The page only leaves once it has slid away; Back or a gesture starts the slide.
  usePreventRemove(!leaving, () => close());
  // An effect, like the session's, so the removal guard has been released first.
  useEffect(() => {
    if (!leaving) return;
    if (navigation.canGoBack()) navigation.goBack(); else router.replace(fallback as never);
  }, [leaving, navigation, router, fallback]);
  const settle = useCallback(() => { if (!closing.current) Animated.timing(motion, { toValue: 1, ...navigationTiming(reduced ? 0 : 180) }).start(); }, [motion, reduced]);
  // One swipe, two listeners. The header and footer use the session's touch
  // handler. Over the list, Android's scroll view claims a vertical drag
  // itself, so a gesture that runs alongside its scrolling takes the pull
  // instead, once the list is at its top. Whichever starts first owns the pull.
  const owner = useRef<"touch" | "list" | null>(null);
  const follow = useCallback((dy: number) => { if (!closing.current) motion.setValue(1 - Math.min(height, Math.max(0, dy)) / height); }, [motion, height]);
  const release = useCallback((dy: number, speed: number) => {
    owner.current = null;
    if (dy > Math.max(90, height * 0.18) || (dy > 35 && speed > 600)) close(); else settle();
  }, [height, close, settle]);
  // PanResponder registers these callbacks; it never invokes them during render.
  /* eslint-disable react-hooks/refs */
  const drag = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) => !reduced && !closing.current && owner.current === null && offset.current <= 1
      && gesture.dy > 12 && gesture.dy > Math.abs(gesture.dx) * 1.5,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { owner.current = "touch"; motion.stopAnimation(); },
    onPanResponderMove: (_event, gesture) => { if (owner.current === "touch") follow(gesture.dy); },
    onPanResponderRelease: (_event, gesture) => { if (owner.current === "touch") release(gesture.dy, gesture.vy * 1000); },
    onPanResponderTerminate: () => { if (owner.current === "touch") { owner.current = null; settle(); } },
  }), [reduced, motion, follow, release, settle]);
  // The list's own scrolling, so the pull can run alongside it.
  const scroll = useMemo(() => Gesture.Native(), []);
  const listDrag = useMemo(() => Gesture.Pan().runOnJS(true)
    .enabled(!reduced)
    .activeOffsetY(12).failOffsetX([-20, 20])
    .simultaneousWithExternalGesture(scroll)
    .onStart(() => { if (!closing.current && owner.current === null && offset.current <= 1) { owner.current = "list"; motion.stopAnimation(); } })
    .onUpdate(event => { if (owner.current === "list") follow(event.translationY); })
    .onEnd(event => { if (owner.current === "list") release(event.translationY, event.velocityY); })
    .onFinalize(() => { if (owner.current === "list") { owner.current = null; settle(); } }), [reduced, scroll, motion, follow, release, settle]);
  /* eslint-enable react-hooks/refs */
  const travel = height + insets.top + insets.bottom + 32;
  return <View style={s.root}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.scrim, { opacity: motion.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }]} />
    <Animated.View testID="slide-up-page" {...drag.panHandlers}
      style={[s.page, { paddingTop: insets.top, transform: [{ translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [travel, 0] }) }] }]}>
      <AppHeader title={title} centered dismiss onBack={close} backLabel="Close" action={action} />
      <GestureDetector gesture={listDrag}><View style={s.flex}><GestureDetector gesture={scroll}>
        <ScrollView style={s.flex} contentContainerStyle={[s.content, { paddingBottom: (footer ? 16 : Math.max(insets.bottom, 16) + 16) }]}
          overScrollMode="never" scrollEventThrottle={16} onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; }}>
          {children}
        </ScrollView>
      </GestureDetector></View></GestureDetector>
      {footer && <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>{footer}</View>}
    </Animated.View>
  </View>;
}
const s = StyleSheet.create({
  root: { flex: 1 }, flex: { flex: 1 },
  scrim: { backgroundColor: colors.scrim },
  page: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  footer: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: colors.background },
});
