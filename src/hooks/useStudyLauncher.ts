import { useRouter } from "expo-router";
import { useTimer } from "../context/TimerContext";
import { useQuests } from "../context/QuestContext";
import { useUser } from "../context/UserContext";
import { useFocusDurationPreference } from "./useFocusDurationPreference";
import { validSessionSeconds } from "../utils/sessionSetup";
import { setupMode } from "../services/setupMode";
import { studySelection } from "../services/studySelection";
import { generalArea, revisionArea, suggestedArea } from "../utils/focusAreas";
import { studyAreaFor } from "../utils/studyPlan";
import type { StudyCourse, StudyExam } from "../types/studyPlan";

/**
 * Opens the study session screen for one subject, from anywhere: Study,
 * Home's exams or a subject's sheet. Its time counts as Revision while the
 * subject has an exam coming up, otherwise as Learning.
 */
export function useStudyLauncher(exams: StudyExam[]) {
  const router = useRouter(), timer = useTimer({ live: false }), { subjects = [] } = useQuests(), { profile } = useUser();
  const duration = useFocusDurationPreference(profile?.id ?? "");
  const blocked = !!(timer.hasOpenSession || timer.actionBusy || timer.isRestoring || timer.restoreError || (timer.isCompleted && !timer.sessionSummary));
  const areaFor = (course: Pick<StudyCourse, "id" | "focusAreaId">) => {
    const general = generalArea(subjects)?.id ?? null;
    const own = course.focusAreaId ?? suggestedArea(subjects, "learning")?.id ?? general;
    return studyAreaFor({ id: course.id, focusAreaId: own }, exams, revisionArea(subjects)?.id, general);
  };
  const study = (course: StudyCourse) => {
    // A running session comes first; Study never replaces it.
    if (blocked) { router.navigate("/session"); return; }
    timer.setNotes(""); timer.setLinkedTaskId(null);
    timer.setTargetAttributeId(areaFor(course));
    // Study starts from the length set in Settings › Sessions.
    if (duration.ready && validSessionSeconds(duration.selectedSeconds)) timer.setDurationInSeconds(duration.selectedSeconds);
    studySelection.choose(course.id); setupMode.choose("study");
    timer.reviewSummary?.(); router.navigate("/session");
  };
  return { study, areaFor, blocked };
}
