import { useRef, useState } from "react";
import { Linking, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { getSessionNotifications } from "../utils/sessionNotifications";
import AppSheet from "../components/AppSheet";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  PersonalButton,
  PersonalPage,
  PersonalRow,
  p,
} from "../components/PersonalUI";
import { colors } from "../constants/theme";
import { useUser } from "../context/UserContext";
import { useAuth } from "../context/AuthContext";
import { useTimer } from "../context/TimerContext";
import { useReducedMotion } from "../hooks/useReducedMotion";

export default function SettingsScreen() {
  const router = useRouter();
  const {
    profile,
    soundEnabled,
    setSoundEnabled,
    hapticsEnabled,
    setHapticsEnabled,
    preferenceError,
  } = useUser();
  const { user, signOut } = useAuth();
  const { hasOpenSession, isRestoring, restoreError, actionBusy } = useTimer();
  const reduced = useReducedMotion();
  const [sheet, setSheet] = useState<"signout" | "notifications" | null>(null);
  const [notificationStatus, setNotificationStatus] = useState(
    "Checking permission…",
  );
  const [busy, setBusy] = useState(false);
  const signOutLock = useRef(false);
  const [error, setError] = useState("");
  const checkNotifications = async () => {
    setError("");
    setSheet("notifications");
    try {
      const notifications = getSessionNotifications();
      if (!notifications) {
        setNotificationStatus("Notification checks are unavailable in this preview. Test session alerts in your installed EAS app or a development build.");
        return;
      }
      const result = await notifications.getPermissionsAsync();
      setNotificationStatus(
        result.granted
          ? "Notifications are allowed on this device."
          : "Notifications aren’t currently allowed. Enable them in your phone’s settings.",
      );
    } catch {
      setNotificationStatus(
        "Couldn’t read notification permission on this device.",
      );
    }
  };
  const logout = async () => {
    if (signOutLock.current || hasOpenSession || isRestoring || restoreError || actionBusy)
      return;
    signOutLock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await signOut();
      if (result.error) throw result.error;
    } catch {
      setError(
        "Couldn’t sign out. Please check your connection and try again.",
      );
      signOutLock.current = false;
      setBusy(false);
    }
  };
  const sessionBlocksLogout =
    hasOpenSession || isRestoring || restoreError || actionBusy;
  return (
    <PersonalPage
      title="Settings"
      subtitle="Make focus feel right for you."
      back
    >
      <View style={p.card}>
        <Text style={p.label}>FOCUS & FEEDBACK</Text>
        <PersonalRow
          icon="volume-medium-outline"
          title="Completion sound"
          subtitle="Sound for the session notification"
          trailing={
            <Switch
              accessibilityLabel="Completion sound"
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              trackColor={{ false: "#343B4E", true: colors.accentFill }}
            />
          }
        />
        <View style={p.divider} />
        <PersonalRow
          icon="phone-portrait-outline"
          title="Haptic feedback"
          subtitle="Gentle feedback when you interact"
          trailing={
            <Switch
              accessibilityLabel="Haptic feedback"
              value={hapticsEnabled}
              onValueChange={setHapticsEnabled}
              trackColor={{ false: "#343B4E", true: colors.accentFill }}
            />
          }
        />
        {preferenceError && <Text style={p.error}>{preferenceError}</Text>}
        <Text style={p.caption}>
          These preferences are saved for your account on this device. Sound
          changes apply when the next session alert is scheduled. Phone
          notification settings can override sound.
        </Text>
      </View>
      <View style={p.card}>
        <Text style={p.label}>YOUR EXPERIENCE</Text>
        <PersonalRow
          icon="notifications-outline"
          title="Notifications"
          subtitle="Permission and completion alerts"
          onPress={() => void checkNotifications()}
        />
        <View style={p.divider} />
        <PersonalRow
          icon="accessibility-outline"
          title="Motion"
          subtitle={
            reduced
              ? "Reduced motion follows your phone settings"
              : "Smooth transitions follow your phone settings"
          }
        />
        <View style={p.divider} />
        <PersonalRow
          icon="compass-outline"
          title="Replay the introduction"
          subtitle="Sessions, growth, goals and rewards"
          onPress={() => router.navigate("/tutorial")}
        />
      </View>
      <View style={p.card}>
        <Text style={p.label}>ACCOUNT</Text>
        <PersonalRow
          icon="person-circle-outline"
          title={profile.username}
          subtitle={user?.email ?? "Signed in"}
        />
        <View style={p.divider} />
        <PersonalRow
          icon="globe-outline"
          title="Progress time zone"
          subtitle={profile.timezone}
        />
        <View style={p.divider} />
        <PersonalRow
          icon="log-out-outline"
          title="Sign out"
          subtitle={
            sessionBlocksLogout
              ? "Finish or end your session first"
              : "Your saved progress stays with your account"
          }
          onPress={() => {
            setError("");
            setSheet("signout");
          }}
        />
      </View>
      <Text style={p.caption}>
        LifeRPG · Your effort, reflected. Character attributes describe recorded
        practice and consistency.
      </Text>
      <AppSheet
        label={sheet === "signout" ? "Sign out" : "Notifications"}
        visible={sheet !== null}
        guardDismiss={busy}
        onRequestClose={() => {
          if (!busy) setSheet(null);
        }}
        header={
          <View style={p.sheetHeader}>
            <Text style={p.title}>
              {sheet === "signout"
                ? "Sign out of LifeRPG?"
                : "Session notifications"}
            </Text>
          </View>
        }
      >
        <BottomSheetScrollView contentContainerStyle={p.sheetBody}>
          {sheet === "signout" ? (
            <>
              <Text style={p.body}>
                {sessionBlocksLogout
                  ? "Finish or end your current session before signing out. If restoration failed, return to Session and retry first."
                  : "Your character, quests and saved sessions remain with your account. Sign in again to continue."}
              </Text>
              {error && <Text style={p.error}>{error}</Text>}
              <PersonalButton
                title={busy ? "Signing out…" : "Sign out"}
                disabled={busy || sessionBlocksLogout}
                onPress={() => void logout()}
              />
              <PersonalButton
                secondary
                title="Keep me signed in"
                disabled={busy}
                onPress={() => setSheet(null)}
              />
            </>
          ) : (
            <>
              <Text style={p.body}>{notificationStatus}</Text>
              <Text style={p.body}>
                Completion alerts remain separate from the in-app timer.
                Lock-screen countdowns and widgets will be added in a future
                native build.
              </Text>
              <PersonalButton
                title="Open phone settings"
                onPress={() =>
                  void Linking.openSettings().catch(() =>
                    setError("Couldn’t open phone settings."),
                  )
                }
              />
              {error && <Text style={p.error}>{error}</Text>}
            </>
          )}
        </BottomSheetScrollView>
      </AppSheet>
    </PersonalPage>
  );
}
