import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useUser } from "../context/UserContext";
import { useTimer } from "../context/TimerContext";
import { enableNotifications, openNotificationSettings, readNotificationPermission, type NotificationPermission } from "../services/notificationPermissionService";
import { notificationOnboardingStore } from "../services/notificationOnboardingStore";
import { useActiveSheetCount } from "../utils/sheetActivity";
import { colors } from "../constants/theme";
import AppSheet from "./AppSheet";
import { Text } from "./AppText";
import { PersonalButton, p } from "./PersonalUI";

export default function NotificationOnboardingPrompt({ tourActive, revision = 0 }: { tourActive: boolean; revision?: number }) {
  const auth = useAuth(), { profile } = useUser(), timer = useTimer({ live: false }), pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [activityId] = useState(() => Symbol("notification-invitation"));
  const otherSheets = useActiveSheetCount(activityId);
  const [foreground, setForeground] = useState(!AppState?.currentState || AppState.currentState === "active");
  const owner = auth.user?.id === profile.id ? profile.id : "";
  const scopeKey = JSON.stringify([owner, auth.admissionEpoch]);
  const scope = useRef(scopeKey), epoch = useRef(0), action = useRef<number | null>(null), sequence = useRef(0);
  const eligible = !!owner && auth.accessMode === "online" && profile.onboarding_completed && foreground && pathname === "/"
    && !tourActive && otherSheets === 0 && !timer.hasOpenSession && !timer.actionBusy && !timer.isRestoring
    && !timer.restoreError && !timer.rewardsVisible && !(timer.isCompleted && !timer.sessionSummary);
  const eligibility = useRef(eligible);
  useLayoutEffect(() => { eligibility.current = eligible; }, [eligible]);
  const [view, setView] = useState<{ scope: string; permission: NotificationPermission | null; ready: boolean; busy: boolean; error: string }>({
    scope: scopeKey, permission: null, ready: false, busy: false, error: "",
  });
  const invalidateScope = useCallback(() => { epoch.current++; action.current = null; }, []);
  useLayoutEffect(() => {
    scope.current = scopeKey; invalidateScope();
    return invalidateScope;
  }, [scopeKey, invalidateScope]);
  useEffect(() => {
    const listener = AppState?.addEventListener("change", state => setForeground(state === "active"));
    return () => listener?.remove();
  }, []);
  useEffect(() => {
    let live = true;
    const generation = epoch.current;
    const current = () => live && scope.current === scopeKey && epoch.current === generation;
    if (eligible && action.current === null) void (async () => {
      try {
        const invitation = await notificationOnboardingStore.read(owner, current);
        if (!current() || invitation !== "ready") return;
        const permission = await readNotificationPermission();
        if (!current()) return;
        if (permission.granted === true) {
          await notificationOnboardingStore.dismiss(owner, current);
          if (current()) setView({ scope: scopeKey, permission: null, ready: false, busy: false, error: "" });
        } else if (permission.supported) setView({ scope: scopeKey, permission, ready: true, busy: false, error: "" });
      } catch { /* Settings remains available if the optional invitation cannot load. */ }
    })();
    return () => { live = false; };
  }, [eligible, owner, scopeKey, revision]);
  const visible = eligible && view.scope === scopeKey && view.ready;
  const respond = async (enable: boolean) => {
    if (!visible || !eligibility.current || scope.current !== scopeKey || action.current !== null) return;
    const generation = epoch.current, token = ++sequence.current;
    const current = () => scope.current === scopeKey && epoch.current === generation && action.current === token;
    action.current = token;
    setView(previous => ({ ...previous, busy: true, error: "" }));
    try {
      if (enable) {
        if (view.permission?.action === "settings") await openNotificationSettings();
        else await enableNotifications();
        if (!current()) return;
      }
      await notificationOnboardingStore.dismiss(owner, current);
      if (current()) setView({ scope: scopeKey, permission: null, ready: false, busy: false, error: "" });
    } catch {
      if (current()) setView(previous => ({ ...previous, busy: false, error: "Couldn’t finish that step. You can retry or enable notifications later in Settings." }));
    } finally {
      if (current()) { action.current = null; setView(previous => ({ ...previous, busy: false })); }
    }
  };
  return <AppSheet visible={visible} activityId={activityId} compact motionMode="timed" label="session reminders"
    guardDismiss={view.busy} onRequestClose={() => { if (!view.busy) void respond(false); }}
    header={<Text style={[p.title, { paddingHorizontal: 20, paddingBottom: 12 }]}>A reminder when your task is done</Text>}>
    <BottomSheetView style={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 12) + 16, gap: 16 }}>
      <View style={[p.icon, { width: 52, height: 52, borderRadius: 18 }]}><Ionicons name="notifications-outline" size={26} color={colors.accent} /></View>
      <Text style={p.body}>Allow session notifications so you know when your timer finishes, even while your phone is locked.</Text>
      <Text style={p.caption}>You can change this anytime in Settings. Notifications are optional.</Text>
      {!!view.error && <Text style={p.error} accessibilityRole="alert">{view.error}</Text>}
      <PersonalButton title={view.busy ? "Please wait…" : view.permission?.action === "settings" ? "Open notification settings" : "Enable notifications"}
        disabled={view.busy} onPress={() => void respond(true)} />
      <PersonalButton secondary title="Not now" disabled={view.busy} onPress={() => void respond(false)} />
    </BottomSheetView>
  </AppSheet>;
}
