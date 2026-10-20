import { useRouter } from "expo-router";
import { useTimer } from "../context/TimerContext";
import { useUser } from "../context/UserContext";
import { useQuests } from "../context/QuestContext";
import { useFocusDurationPreference } from "./useFocusDurationPreference";
import { setupMode } from "../services/setupMode";
import { generalArea, suggestedArea } from "../utils/focusAreas";
import { encodeRoutineSession } from "../utils/routineSession";
import type { RoutineIdea } from "../constants/routineIdeas";
import type { Subject } from "../services/taskService";
import { validSessionSeconds } from "../utils/sessionSetup";
import { tapHaptic } from "../utils/tapHaptics";

/**
 * Opens the session screen for any activity: no routine, no subject. It
 * starts from Everyday focus and the length set in Settings › Sessions; both
 * can be changed there. A session already open comes first.
 */
export function useJustFocus() {
  const router = useRouter(), timer = useTimer({ live: false }), { profile, hapticsEnabled } = useUser(), { subjects = [] } = useQuests();
  const duration = useFocusDurationPreference(profile?.id ?? "");
  const blocked = !!(timer.hasOpenSession || timer.actionBusy || timer.isRestoring || timer.restoreError || (timer.isCompleted && !timer.sessionSummary));
  return () => {
    if (!blocked) {
      timer.setNotes(""); timer.setLinkedTaskId(null);
      timer.setTargetAttributeId(generalArea(subjects)?.id ?? null);
      if (duration.ready && validSessionSeconds(duration.selectedSeconds)) timer.setDurationInSeconds(duration.selectedSeconds);
      setupMode.choose("routine"); setupMode.chooseRoutine(null);
    }
    timer.reviewSummary?.();
    if (hapticsEnabled) tapHaptic("medium");
    router.navigate("/session");
  };
}

/**
 * Starts one of the ready-made ideas without saving it: the session screen
 * opens filled in with its name, length and category, like a routine.
 */
export function useStartIdea() {
  const router = useRouter(), timer = useTimer({ live: false }), { hapticsEnabled } = useUser(), { subjects = [] } = useQuests();
  const blocked = !!(timer.hasOpenSession || timer.actionBusy || timer.isRestoring || timer.restoreError || (timer.isCompleted && !timer.sessionSummary));
  return (idea: RoutineIdea) => {
    const notes = encodeRoutineSession(idea.name);
    if (!blocked && notes !== null) {
      timer.setLinkedTaskId(null);
      timer.setTargetAttributeId(suggestedArea(subjects as Subject[], idea.area)?.id ?? null);
      timer.setNotes(notes); timer.setDurationInSeconds(idea.minutes * 60);
      setupMode.choose("routine"); setupMode.chooseRoutine(null);
    }
    timer.reviewSummary?.();
    if (hapticsEnabled) tapHaptic("medium");
    router.navigate("/session");
  };
}
