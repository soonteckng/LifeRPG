import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TourAnchor } from "../../components/FeatureTour";
import { useFocusEffect, useRouter } from "expo-router";
import ContentReveal from "../../components/ContentReveal";
import { PersonalPage } from "../../components/PersonalUI";
import { Text } from "../../components/AppText";
import Pressable from "../../components/MotionPressable";
import SavedRoutinesCard from "../../components/SavedRoutinesCard";
import HowItWorksSheet from "../../components/HowItWorksSheet";
import { CircleButton } from "../../components/SectionHeader";
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
  const timer = useTimer({ live: false }), { accessMode } = useAuth();
  const { tasks, subjects = [], refresh } = useQuests();
  const justFocus = useJustFocus(), router = useRouter();
  const bottomInset = useTabDockInset("routines");
  const [how, setHow] = useState(false);
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
  return <PersonalPage title="Routines" subtitle="" compact bottomContentInset={bottomInset}
    action={<CircleButton icon="help" size={36} label="How Routines work" onPress={() => setHow(true)} />}>
    <ContentReveal><View style={s.stack}>
      <Pressable onPress={justFocus} accessibilityRole="button" accessibilityLabel={open ? "Return to your session" : "Just focus. Any activity, your time"} testID="routines-just-focus" style={s.card}>
        <View style={s.icon}><Ionicons name={open ? "timer-outline" : "sparkles"} size={22} color="#AAB3FF" /></View>
        <View style={s.copy}><Text style={s.title}>{open ? "Your session" : "Just focus"}</Text>
          <Text style={s.caption}>{open ? timer.isRunning ? "In progress. Tap to return" : "Paused. Tap to return" : "Any activity, your time"}</Text></View>
        <View style={s.play}><Ionicons name={open ? "chevron-up" : "play"} size={20} color={colors.primaryText} /></View>
      </Pressable>
      <SavedRoutinesCard layout="grid" wrapMine={mine => <TourAnchor id="routines-mine" style={s.mine}>{mine}</TourAnchor>} subjects={subjects} limit={Number.MAX_SAFE_INTEGER} active={accessMode === "online" || subjects.length > 0} legacyTasks={tasks} onStartLegacy={startLegacy} />
    </View></ContentReveal>
    <HowItWorksSheet visible={how} onClose={() => setHow(false)} title="How Routines work" label="how routines work" steps={HOW_IT_WORKS} />
  </PersonalPage>;
}
const HOW_IT_WORKS = [
  ["Just focus", "Pick any activity and set your own time. Perfect for when you just want to get going."],
  ["Save a routine", "Give it a name, a length and a category, plus a daily reminder if you like."],
  ["Start in one tap", "Tap ▶ on a routine and you’re straight into a session."],
  ["Change or remove", "Hold a routine to edit or remove it. We’ll always check before removing anything."],
  ["Need ideas?", "Grab one of the ideas below and make it yours."],
] as const;

const s = StyleSheet.create({
  stack: { gap: 24 },
  // Same spacing as the routines card, so the guide's highlight changes nothing on screen.
  mine: { gap: 10 },
  // Just focus is the main way in, so it gets the biggest card on the page.
  card: { ...edge, minHeight: 92, flexDirection: "row", alignItems: "center", gap: 14, paddingLeft: 16, paddingRight: 14, borderRadius: 22, backgroundColor: colors.surface },
  icon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(170,179,255,0.16)" },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  title: { color: colors.text, fontSize: 19, lineHeight: 24, fontWeight: "700", letterSpacing: -0.3 },
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 19 },
  play: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
});
