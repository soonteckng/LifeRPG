import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import ContentReveal from "../../components/ContentReveal";
import { PersonalPage } from "../../components/PersonalUI";
import { Text } from "../../components/AppText";
import FreeFocusCard from "../../components/FreeFocusCard";
import CategorySheet from "../../components/CategorySheet";
import SavedRoutinesCard from "../../components/SavedRoutinesCard";
import SessionProtectionControl from "../../components/SessionProtectionControl";
import SectionHeader from "../../components/SectionHeader";
import { PinnedRoute } from "../../components/PinnedAction";
import { colors, edge } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { useQuests } from "../../context/QuestContext";
import { useTimer } from "../../context/TimerContext";
import { useQuickStart } from "../../hooks/useQuickStart";
import { useTabDockInset } from "../../hooks/useTabDockInset";
import { setupMode } from "../../services/setupMode";
import { lifeAreaColor } from "../../utils/lifeAreaColor";

/** Routines: a quick focus in any category, and every routine you keep. */
export default function RoutinesScreen() {
  return <PinnedRoute name="routines"><Routines /></PinnedRoute>;
}
function Routines() {
  const timer = useTimer(), { accessMode } = useAuth();
  const { tasks, subjects = [], refresh } = useQuests();
  const quick = useQuickStart();
  const bottomInset = useTabDockInset("routines");
  const [categoryOpen, setCategoryOpen] = useState(false);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const open = !!timer.hasOpenSession;
  const shownAreaId = open ? timer.targetAttributeId : quick.areaId;
  const shownArea = subjects.find(area => area.id === shownAreaId);
  const start = () => { setupMode.choose("routine"); setupMode.chooseRoutine(null); void quick.start(); };
  return <PersonalPage title="Routines" subtitle="" compact bottomContentInset={bottomInset}>
    <ContentReveal><View style={s.stack}>
      <View style={s.section}>
        <SectionHeader title={open ? "Now" : "Quick focus"} subtitle={open ? "Your session is open." : undefined} />
        {!quick.ready ? <View style={s.loading} testID="routines-preference-loading"><Text style={s.caption}>{quick.preference.error || quick.duration.error ? "Your focus settings need a retry." : "Getting your focus ready…"}</Text></View>
          : <FreeFocusCard label="Quick focus"
          seconds={open ? timer.finishing ? 0 : timer.timeLeft : quick.seconds} duration={open ? timer.duration : undefined}
          area={open ? shownArea?.title ?? "General" : quick.title} areaId={shownAreaId} subjects={subjects}
          tint={lifeAreaColor(shownAreaId, shownArea?.color_code)}
          active={open} running={!!timer.isRunning} awaitingStart={timer.awaitingStart} finishing={open && timer.finishing} breakSeconds={open ? timer.breakSecondsLeft : 0}
          dimmed={quick.unavailable} starting={quick.starting} restoring={!!timer.isRestoring}
          disabled={quick.blocked || (!open && (quick.areasLoading || quick.questsError)) || quick.preference.busy}
          changeDisabled={quick.starting || !!timer.actionBusy || quick.areasLoading || quick.questsError || quick.preference.busy}
          failed={quick.failed} error={timer.actionError ?? undefined}
          setupError={quick.preference.error ? "Couldn’t save your category. Your previous choice is still selected. Try again." : undefined}
          onChange={id => void quick.changeArea(id)} onStart={open ? quick.openSession : start}
          onPreferences={() => setCategoryOpen(true)} protection={<SessionProtectionControl activeSurface={accessMode === "online"} />}
          onDuration={quick.chooseDuration} customSeconds={quick.duration.value.customSeconds} onCustomDuration={next => quick.chooseDuration(next, true)} />}
      </View>
      <SavedRoutinesCard subjects={subjects} limit={Number.MAX_SAFE_INTEGER} active={accessMode === "online"} legacyTasks={tasks} onStartLegacy={quick.openQuestSession}
        initialSeconds={quick.seconds} initialAreaId={quick.areaId} />
    </View></ContentReveal>
    <CategorySheet visible={categoryOpen} subjects={subjects} selectedId={quick.areaId} disabled={quick.preference.busy}
      onChoose={id => void quick.changeArea(id)} onClose={() => setCategoryOpen(false)} />
  </PersonalPage>;
}
const s = StyleSheet.create({
  stack: { gap: 26 }, section: { gap: 10 },
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  loading: { ...edge, minHeight: 120, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: colors.surface },
});
