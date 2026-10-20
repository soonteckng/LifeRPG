import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector, ScrollView } from "react-native-gesture-handler";
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
  // The drag runs alongside the content's own scrolling, so it also works over
  // a long, scrollable page: it only moves the page when the drag began with
  // the content at its top. Callbacks run on JS, where the page's motion lives.
  const scroll = useMemo(() => Gesture.Native(), []);
  const dragging = useRef(false);
  // Gesture callbacks run on touch, never during render.
  /* eslint-disable react-hooks/refs */
  const drag = useMemo(() => Gesture.Pan().runOnJS(true)
    .enabled(!reduced)
    .activeOffsetY(12).failOffsetX([-20, 20])
    .simultaneousWithExternalGesture(scroll)
    .onStart(() => { dragging.current = !closing.current && offset.current <= 1; if (dragging.current) motion.stopAnimation(); })
    .onUpdate(event => { if (dragging.current && !closing.current) motion.setValue(1 - Math.min(height, Math.max(0, event.translationY)) / height); })
    .onEnd(event => {
      if (!dragging.current) return;
      dragging.current = false;
      if (event.translationY > Math.max(90, height * 0.18) || (event.translationY > 35 && event.velocityY > 600)) close(); else settle();
    })
    .onFinalize(() => { if (dragging.current) { dragging.current = false; settle(); } }), [reduced, scroll, motion, height, close, settle]);
  /* eslint-enable react-hooks/refs */
  const travel = height + insets.top + insets.bottom + 32;
  return <View style={s.root}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.scrim, { opacity: motion.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }]} />
    <GestureDetector gesture={drag}><Animated.View testID="slide-up-page"
      style={[s.page, { paddingTop: insets.top, transform: [{ translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [travel, 0] }) }] }]}>
      <AppHeader title={title} centered dismiss onBack={close} backLabel="Close" action={action} />
      <GestureDetector gesture={scroll}><ScrollView style={s.flex} contentContainerStyle={[s.content, { paddingBottom: (footer ? 16 : Math.max(insets.bottom, 16) + 16) }]}
        scrollEventThrottle={16} onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; }}>
        {children}
      </ScrollView></GestureDetector>
      {footer && <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>{footer}</View>}
    </Animated.View></GestureDetector>
  </View>;
}
const s = StyleSheet.create({
  root: { flex: 1 }, flex: { flex: 1 },
  scrim: { backgroundColor: "rgba(0,0,0,0.5)" },
  page: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  footer: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: colors.background },
});
