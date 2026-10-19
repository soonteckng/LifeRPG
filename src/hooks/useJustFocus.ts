import { useRouter } from "expo-router";
import { useTimer } from "../context/TimerContext";
import { useUser } from "../context/UserContext";
import { useQuests } from "../context/QuestContext";
import { useFocusDurationPreference } from "./useFocusDurationPreference";
import { setupMode } from "../services/setupMode";
import { generalArea } from "../utils/focusAreas";
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
