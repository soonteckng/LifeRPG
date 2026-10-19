import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import ContentReveal from "../../components/ContentReveal";
import { PersonalPage } from "../../components/PersonalUI";
import { Text } from "../../components/AppText";
import Pressable from "../../components/MotionPressable";
import SavedRoutinesCard from "../../components/SavedRoutinesCard";
import { colors, edge } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { useQuests } from "../../context/QuestContext";
import { useTimer } from "../../context/TimerContext";
import { useJustFocus } from "../../hooks/useJustFocus";
import { useTabDockInset } from "../../hooks/useTabDockInset";
import { setupMode } from "../../services/setupMode";
import type { Task } from "../../services/taskService";

/**
 * Routines: a list, like Study. "Just focus" starts any activity; each
 * routine has its own ▶. The session screen picks the time and category.
 */
export default function RoutinesScreen() {
  const timer = useTimer(), { accessMode } = useAuth();
  const { tasks, subjects = [], refresh } = useQuests();
  const justFocus = useJustFocus(), router = useRouter();
  const bottomInset = useTabDockInset("routines");
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const open = !!timer.hasOpenSession;
  // Old routines keep their task link; the setup screen confirms before starting.
  const startLegacy = (task: Task) => {
    if (!open && !timer.actionBusy && !timer.isRestoring && !timer.restoreError && !(timer.isCompleted && !timer.sessionSummary)) {
      timer.setNotes(""); timer.setLinkedTaskId(task.id);
      timer.setDurationInMinutes(task.target_minutes || 30); timer.setTargetAttributeId(task.subject_id ?? null);
      setupMode.choose("routine");
    }
    timer.reviewSummary?.(); router.navigate("/session");
  };
  return <PersonalPage title="Routines" subtitle="" compact bottomContentInset={bottomInset}>
    <ContentReveal><View style={s.stack}>
      <Pressable onPress={justFocus} accessibilityRole="button" accessibilityLabel={open ? "Return to your session" : "Just focus. Any activity, your time"} testID="routines-just-focus" style={s.card}>
        <View style={s.icon}><Ionicons name={open ? "timer-outline" : "sparkles"} size={18} color="#AAB3FF" /></View>
        <View style={s.copy}><Text style={s.title}>{open ? "Your session" : "Just focus"}</Text>
          <Text style={s.caption}>{open ? timer.isRunning ? "In progress. Tap to return" : "Paused. Tap to return" : "Any activity, your time"}</Text></View>
        <View style={s.play}><Ionicons name={open ? "chevron-up" : "play"} size={16} color={colors.primaryText} /></View>
      </Pressable>
      <SavedRoutinesCard subjects={subjects} limit={Number.MAX_SAFE_INTEGER} active={accessMode === "online" || subjects.length > 0} legacyTasks={tasks} onStartLegacy={startLegacy} />
    </View></ContentReveal>
  </PersonalPage>;
}
const s = StyleSheet.create({
  stack: { gap: 24 },
  card: { ...edge, minHeight: 68, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 14, paddingRight: 12, borderRadius: 18, backgroundColor: colors.surface },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(170,179,255,0.16)" },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  title: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "600" },
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 19 },
  play: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
});
