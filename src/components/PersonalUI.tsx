import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Animated, Platform, useWindowDimensions, ScrollView, StyleSheet, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { type } from "../constants/typography";
import { colors } from "../constants/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { usePreventRemove } from "expo-router/react-navigation";
import AppHeader from "./AppHeader";
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
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  back?: boolean;
  action?: ReactNode;
  animateTransition?: boolean;
  compact?: boolean;
  floatingAction?: boolean;
  bottomContentInset?: number;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const controlled = back && animateTransition && Platform.OS === "android";
  const [position] = useState(() => new Animated.Value(controlled ? width : 0));
  const closing = useRef(false);
  const [exitReady, setExitReady] = useState(false);
  useEffect(() => {
    if (!controlled || closing.current) return;
    const animation = Animated.timing(position, {
      toValue: 0,
      duration: reduced ? 0 : 280,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [controlled, position, reduced]);
  const close = useCallback(() => {
    if (closing.current) return;
    if (!controlled) {
      if (router.canGoBack()) router.back();
      else router.replace("/profile");
      return;
    }
    if (!navigation.canGoBack()) {
      router.replace("/profile");
      return;
    }
    closing.current = true;
    Animated.timing(position, {
      toValue: width,
      duration: reduced ? 0 : 260,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setExitReady(true);
      else {
        closing.current = false;
        position.setValue(0);
      }
    });
  }, [controlled, navigation, router, position, width, reduced]);
  usePreventRemove(controlled && !exitReady, close);
  useEffect(() => {
    if (exitReady) navigation.goBack();
  }, [exitReady, navigation]);
  return (
    <Animated.View
      testID="personal-page-surface"
      style={{
        flex: 1,
        backgroundColor: colors.background,
        transform: [{ translateX: position }],
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
        {!back && !floatingAction && <AppHeader title={title} action={action} />}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            p.content,
            { paddingBottom: Math.max(48, insets.bottom + 24, bottomContentInset + 24) },
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
        </ScrollView>
      </SafeAreaView>
    </Animated.View>
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
}: {
  value: number;
  color?: string;
}) {
  return (
    <View
      style={p.track}
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
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        p.button,
        secondary && p.secondaryButton,
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text style={[p.buttonText, secondary && { color: colors.accent }]}>
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
    fontSize: 32,
    fontWeight: "500",
    letterSpacing: -1,
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "500",
    letterSpacing: -0.4,
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
    borderRadius: 16,
    backgroundColor: "#E5E4FF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 16, fontWeight: "500", color: colors.background },
  secondaryButton: { backgroundColor: colors.accentSoft },
  input: {
    minHeight: 50,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    color: colors.text,
    fontSize: 16,
  },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21 },
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
    fontSize: 28,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
});
