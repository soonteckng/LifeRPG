import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ContentReveal from "../../components/ContentReveal";
import { PersonalPage } from "../../components/PersonalUI";
import { Text } from "../../components/AppText";
import SavedRoutinesCard from "../../components/SavedRoutinesCard";
import { colors } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { useQuests } from "../../context/QuestContext";
import { useTimer } from "../../context/TimerContext";
import { floatingTabInset } from "../../utils/floatingTabInset";
import type { Task } from "../../services/taskService";

/** Every routine in one place: start, edit, hold or swipe for more. */
export default function RoutinesScreen() {
  const router = useRouter(), insets = useSafeAreaInsets(), timer = useTimer(), { accessMode } = useAuth();
  const bottomInset = floatingTabInset(useBottomTabBarHeight(), insets.bottom, timer);
  const { tasks, subjects = [], refresh } = useQuests();
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const openQuestSession = (task: Task) => {
    // Existing sessions and unresolved completion/restoration always win, as on Home.
    if (!timer.hasOpenSession && !timer.actionBusy && !timer.isRestoring && !timer.restoreError && !(timer.isCompleted && !timer.sessionSummary)) {
      timer.setNotes(""); timer.setLinkedTaskId(task.id); timer.setDurationInMinutes(task.target_minutes || 30); timer.setTargetAttributeId(task.subject_id ?? null);
    }
    timer.reviewSummary?.(); router.navigate("/session");
  };
  return <PersonalPage title="Routines" subtitle="" compact bottomContentInset={bottomInset}>
    <ContentReveal><View style={s.stack}>
      <Text style={s.lead}>Things you come back to. Tap play to start, or hold or swipe one for more.</Text>
      <SavedRoutinesCard subjects={subjects} limit={Number.MAX_SAFE_INTEGER} active={accessMode === "online"} legacyTasks={tasks} onStartLegacy={openQuestSession} />
    </View></ContentReveal>
  </PersonalPage>;
}
const s = StyleSheet.create({
  stack: { gap: 16 },
  lead: { color: colors.secondary, fontSize: 15, lineHeight: 21, paddingHorizontal: 4 },
});
