import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { colors, edge } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { useTimer } from "../context/TimerContext";
import { useOfflineReconnect } from "../hooks/useOfflineReconnect";

/**
 * The one sign that the app is offline: everything else works as usual and
 * syncs later. Tapping it checks the connection (at most every 5 seconds).
 */
export default function OfflineStatus() {
  const auth = useAuth(), timer = useTimer({ live: false });
  const owner = auth.localOwner;
  const reconnect = useOfflineReconnect({
    scope: owner ? JSON.stringify([owner.backendId, owner.id, auth.admissionEpoch]) : null,
    active: auth.accessMode === "local-only", blocked: timer.actionBusy || timer.isRestoring,
    reconnect: auth.retrySessionVerification,
  });
  if (auth.accessMode !== "local-only") return null;
  const waiting = timer.unsyncedSessionCount;
  const detail = reconnect.checking ? "Checking connection…" : waiting > 0 ? `${waiting} ${waiting === 1 ? "session" : "sessions"} to sync` : "Saved on this phone";
  return <View style={s.row} pointerEvents="box-none">
    <Pressable testID="offline-status" onPress={() => void reconnect.retry()} disabled={reconnect.disabled} accessibilityRole="button"
      accessibilityLabel={`Offline. ${detail}. Check connection`} accessibilityState={{ disabled: reconnect.disabled, busy: reconnect.checking }} style={s.pill}>
      <View style={s.dot} />
      <Text style={s.title}>Offline</Text>
      <Text style={s.detail} numberOfLines={1}>· {detail}</Text>
      {!reconnect.checking && !reconnect.disabled && <Ionicons name="refresh" size={13} color={colors.secondary} />}
    </Pressable>
  </View>;
}
const s = StyleSheet.create({
  row: { alignItems: "center" },
  pill: { ...edge, maxWidth: "100%", minHeight: 32, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.surface },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.streak },
  title: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  detail: { flexShrink: 1, color: colors.secondary, fontSize: 13, lineHeight: 18 },
});
