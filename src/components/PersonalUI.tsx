import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Animated, Platform, useWindowDimensions, StyleSheet, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { type } from "../constants/typography";
import { colors, edge } from "../constants/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { usePreventRemove } from "expo-router/react-navigation";
import { TourScrollView } from "./FeatureTour";
import { zoomTiming } from "../utils/navigationMotion";
import AppHeader from "./AppHeader";
import SwipeBack, { ParallaxLayer, slideTo, useSwipeOffset, type PageMotion } from "./SwipeBack";
import { pageStack } from "../utils/pageStack";
import { readSettingsOrigin, settingsTransform } from "../utils/settingsOrigin";
export type PersonalIcon = ComponentProps<typeof Ionicons>["name"];
export function PersonalPage({
  title,
  subtitle,
  children,
  back = false,
  action,
  animateTransition = false,
  compact = false,
  floatingAction = false,
  bottomContentInset = 0,
  expandFromIcon = false,
  fallback = "/profile",
  footer,
  pinned,
  today = false,
}: {
  /** A page that opens from Today, with a "Today" link back. */
  today?: boolean;
  title: string;
  subtitle: string;
  children: ReactNode;
  back?: boolean;
  action?: ReactNode;
  animateTransition?: boolean;
  compact?: boolean;
  floatingAction?: boolean;
  bottomContentInset?: number;
  expandFromIcon?: boolean;
  /** Where Back goes when there is nothing to go back to. */
  fallback?: "/profile" | "/settings" | "/";
  /** Stays fixed under the scrolling content, like Save on a form. */
  footer?: ReactNode;
  /** Stays fixed above the scrolling content, like a preview you keep in view. */
  pinned?: ReactNode;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const navigation = useNavigation();
  const { width, height } = useWindowDimensions();
  const controlled = back && animateTransition && (Platform.OS === "android" || expandFromIcon);
  const [source] = useState(readSettingsOrigin);
  const surface = useRef<View>(null);
  const [frame, setFrame] = useState({ x: 0, y: 0, width, height });
  const [frameReady, setFrameReady] = useState(!expandFromIcon);
  // Pages that grow out of a button (Profile, Settings) scale on `position`.
  const [position] = useState(() => new Animated.Value(controlled && expandFromIcon ? 1 : 0));
  // Second-level pages slide on one offset (0 on screen, width off to the
  // right): the slide in, a finger swipe and the slide out all move the same
  // value, and the page beneath drifts with it, so they can never disagree.
  const slides = controlled && !expandFromIcon;
  const offset = useSwipeOffset(slides ? width : 0);
  const [stackId] = useState(() => pageStack.reserve());
  useLayoutEffect(() => {
    if (!back) return;
    pageStack.add(stackId, slides ? { swipe: offset } : null);
    return () => pageStack.remove(stackId);
  }, [back, slides, offset, stackId]);
  const stacked = useSyncExternalStore(pageStack.subscribe, () => pageStack.above<PageMotion>(stackId), () => null);
  // A page only drifts aside while another page really covers it. Once this
  // page is in front again it always sits straight, even if a page above was
  // left registered by an interrupted transition.
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    const blur = navigation.addListener?.("blur", () => setCovered(true));
    const focus = navigation.addListener?.("focus", () => setCovered(false));
    return () => { blur?.(); focus?.(); };
  }, [navigation]);
  const above = covered ? stacked : null;
  const origin = settingsTransform(source, frame);
  const closing = useRef(false);
  const [exitReady, setExitReady] = useState(false);
  const pendingAction = useRef<Parameters<typeof navigation.dispatch>[0] | null>(null);
  useEffect(() => {
    if (frameReady) return;
    const deadline = setTimeout(() => setFrameReady(true), 150);
    return () => clearTimeout(deadline);
  }, [frameReady]);
  useLayoutEffect(() => {
    if (!controlled || !frameReady || closing.current) return;
    if (slides) { slideTo(offset, 0, reduced ? 0 : 240); return; }
    const animation = Animated.timing(position, { toValue: 0, ...zoomTiming(reduced ? 0 : 360, false) });
    animation.start();
    return () => animation.stop();
  }, [controlled, slides, offset, position, reduced, frameReady]);
  const close = useCallback(() => {
    if (closing.current) return;
    if (!controlled) {
      if (router.canGoBack()) router.back();
      else router.replace(fallback);
      return;
    }
    if (!navigation.canGoBack()) {
      router.replace(fallback);
      return;
    }
    closing.current = true;
    if (slides) { slideTo(offset, width, reduced ? 0 : 230, () => setExitReady(true)); return; }
    const animation = Animated.timing(position, { toValue: 1, ...zoomTiming(reduced ? 0 : 320, true) });
    animation.start(({ finished }) => {
      if (finished) setExitReady(true);
      else {
        closing.current = false;
        position.setValue(0);
      }
    });
  }, [controlled, slides, offset, navigation, router, position, width, reduced, fallback]);
  // The swipe has already carried the page away; leave without animating again.
  // Settings opens from and returns to its icon, so it has no swipe.
  const swiped = useCallback(() => {
    if (closing.current) return;
    if (!navigation.canGoBack()) { router.replace(fallback); return; }
    closing.current = true; setExitReady(true);
  }, [navigation, router, fallback]);
  usePreventRemove(controlled && !exitReady, event => { pendingAction.current = event?.data?.action ?? null; close(); });
  useEffect(() => {
    if (exitReady) { if (pendingAction.current) navigation.dispatch(pendingAction.current); else navigation.goBack(); }
  }, [exitReady, navigation]);
  return (
    <View
      ref={surface}
      testID={expandFromIcon ? "settings-frame" : undefined}
      collapsable={false}
      onLayout={() => { if (expandFromIcon) surface.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => { if (measuredWidth > 0 && measuredHeight > 0) { setFrame(previous => previous.x === x && previous.y === y && previous.width === measuredWidth && previous.height === measuredHeight ? previous : { x, y, width: measuredWidth, height: measuredHeight }); setFrameReady(true); } }); }}
      style={{ flex: 1 }}
    >{expandFromIcon && <Animated.View pointerEvents="none" testID="personal-page-dim"
      style={[StyleSheet.absoluteFill, { backgroundColor: "#2A2028", opacity: position.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0], extrapolate: "clamp" }) }]} />}
      {/* Home dims softly behind a page growing out of its button. */}
      <ParallaxLayer above={above} width={width}><SwipeBack enabled={slides && !exitReady} onBack={swiped} offset={offset}><Animated.View
      renderToHardwareTextureAndroid={controlled}
      testID="personal-page-surface"
      style={{
        flex: 1,
        backgroundColor: colors.background,
        opacity: expandFromIcon ? position.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 0.25, 0], extrapolate: "clamp" }) : 1,
        borderRadius: expandFromIcon ? 24 : 0,
        overflow: "hidden",
        transformOrigin: expandFromIcon ? [origin.x, origin.y, 0] : undefined,
        transform: expandFromIcon ? [{ scale: position.interpolate({ inputRange: [0, 1], outputRange: [1, origin.scale], extrapolateRight: "clamp" }) }] : [{ translateX: position }],
      }}
    >
      <SafeAreaView edges={["top", "left", "right"]} style={p.page}>
        {back && (
          <AppHeader
            title={title}
            onBack={close}
            backLabel="Go back"
            action={action}
          />
        )}
        {floatingAction && <View style={{ minHeight: 44, paddingHorizontal: 20, flexDirection:"row", justifyContent:"flex-end", alignItems:"center" }}>{action}</View>}
        {!back && !floatingAction && <AppHeader title={title} action={action} onToday={today ? () => router.navigate("/") : undefined} />}
        {pinned && <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10, gap: 12 }}>{pinned}</View>}
        <TourScrollView
          tourBottomInset={bottomContentInset}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            p.content,
            { paddingBottom: footer ? 24 : Math.max(48, insets.bottom + 24, bottomContentInset + 24) },
          ]}
        >
          <View style={{ gap: compact ? 12 : 20 }}>
            {back && (
              <View style={{ gap: 6, paddingBottom: 4 }}>
                {!!subtitle && <Text style={p.body}>{subtitle}</Text>}
              </View>
            )}
            {children}
          </View>
        </TourScrollView>
        {footer && <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: Math.max(16, insets.bottom + 8), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.background }}>{footer}</View>}
      </SafeAreaView>
    </Animated.View></SwipeBack></ParallaxLayer></View>
  );
}
export function PersonalRow({
  icon,
  title,
  subtitle,
  onPress,
  trailing,
}: {
  icon: PersonalIcon;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: ReactNode;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={p.row}
    >
      <View style={p.icon}>
        <Ionicons name={icon} size={20} color={colors.accent} />
      </View>
      <View style={p.flex}>
        <Text style={p.rowTitle}>{title}</Text>
        {subtitle && <Text style={p.caption}>{subtitle}</Text>}
      </View>
      {trailing ||
        (onPress && (
          <Ionicons name="chevron-forward" size={17} color={colors.muted} />
        ))}
    </Pressable>
  );
}
export function Meter({
  value,
  color = colors.accent,
  height,
}: {
  value: number;
  color?: string;
  height?: number;
}) {
  return (
    <View
      style={[p.track, height ? { height, borderRadius: height / 2 } : null]}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(Math.max(0, Math.min(1, value)) * 100),
      }}
    >
      <View
        style={[
          p.fill,
          height ? { borderRadius: height / 2 } : null,
          {
            width: `${Math.max(0, Math.min(1, value)) * 100}%`,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}
export function PersonalButton({
  title,
  onPress,
  disabled = false,
  secondary = false,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        p.button,
        secondary && p.secondaryButton,
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text adjustsFontSizeToFit={false} style={[p.buttonText, secondary && { color: colors.accent }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export const p = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  header: {
    padding: 20,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pageTitle: {
    color: colors.text,
    fontSize: 34,
    fontFamily: "display",
    fontWeight: "400",
    letterSpacing: -0.8,
  },
  content: { padding: 20, paddingTop: 8, paddingBottom: 48 },
  flex: { flex: 1, minWidth: 0 },
  back: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    padding: 20,
    backgroundColor: colors.surface,
    borderRadius: 24,
    ...edge,
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontFamily: "display",
    fontWeight: "500",
    letterSpacing: -0.3,
  },
  sectionLabel: { ...type.section },
  body: { ...type.body, color: colors.secondary },
  caption: { ...type.caption },
  label: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 1,
  },
  row: {
    minHeight: 52,
    paddingVertical: 8,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: "500" },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.line,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 3 },
  button: {
    minHeight: 50,
    padding: 14,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 16, lineHeight: 22, fontWeight: "600", color: colors.primaryText, textAlign: "center" },
  secondaryButton: { backgroundColor: colors.accentSoft },
  input: {
    minHeight: 50,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.background,
    ...edge,
    color: colors.text,
    fontSize: 16,
  },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  sheetHeader: { paddingHorizontal: 20, paddingBottom: 12, gap: 6 },
  sheetBody: { paddingHorizontal: 20, paddingBottom: 30, gap: 16 },
  divider: { height: 1, backgroundColor: colors.line },
  inline: { flexDirection: "row", alignItems: "center", gap: 12 },
  pill: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.accentSoft,
  },
  value: {
    color: colors.text,
    fontSize: 30,
    fontFamily: "display",
    fontWeight: "400",
    fontVariant: ["tabular-nums"],
  },
});
