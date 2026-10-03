import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { colors } from "../constants/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";
export type PersonalIcon = ComponentProps<typeof Ionicons>["name"];
export function PersonalPage({
  title,
  subtitle,
  children,
  back = false,
  action,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  back?: boolean;
  action?: ReactNode;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0.65);
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [opacity, reduced]);
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={p.page}>
      <View style={p.header}>
        {back && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Profile"
            style={p.back}
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/profile")
            }
          >
            <Ionicons name="chevron-back" color={colors.accent} size={22} />
          </Pressable>
        )}
        <View style={p.flex}>
          <Text style={p.pageTitle} accessibilityRole="header">
            {title}
          </Text>
          <Text style={p.body}>{subtitle}</Text>
        </View>
        {action}
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          p.content,
          { paddingBottom: Math.max(48, insets.bottom + 24) },
        ]}
      >
        <Animated.View style={{ opacity, gap: 20 }}>{children}</Animated.View>
      </ScrollView>
    </SafeAreaView>
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
    padding: 22,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pageTitle: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "600",
    letterSpacing: -1,
  },
  content: { padding: 20, paddingTop: 8, paddingBottom: 48 },
  flex: { flex: 1, minWidth: 0 },
  back: {
    width: 40,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    padding: 20,
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.4,
  },
  body: { color: colors.secondary, fontSize: 14, lineHeight: 21 },
  caption: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  label: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
  },
  row: {
    minHeight: 64,
    paddingVertical: 12,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "500" },
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
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 15, fontWeight: "600", color: colors.background },
  secondaryButton: { backgroundColor: colors.accentSoft },
  input: {
    minHeight: 50,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    fontSize: 16,
  },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21 },
  sheetHeader: { paddingHorizontal: 22, paddingBottom: 12, gap: 6 },
  sheetBody: { paddingHorizontal: 22, paddingBottom: 30, gap: 16 },
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
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});
