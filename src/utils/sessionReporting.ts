import { focusAreaTitle } from "./focusAreas";
import { formatSessionActivity } from "../constants/sessionActivities";
import { sessionTime } from "./sessionSetup";

// Known Life areas take precedence. Legacy activity values remain readable only
// when no surviving Life area is available; no historical values are rewritten.
export function sessionCategory(session: { subject_id: number | null; activity_type: string }, areas: { id: number; title: string }[]): string {
  const area = areas.find((item) => item.id === session.subject_id);
  if (area) return focusAreaTitle(area.title);
  return !session.activity_type || ["other", "general"].includes(session.activity_type) ? focusAreaTitle() : formatSessionActivity(session.activity_type);
}

export function sessionDockState(state: { isCompleted: boolean; isRunning: boolean; actionError: string | null; sessionSummary: unknown; timeLeft: number }) {
  if (state.isCompleted) {
    if (state.sessionSummary) return { label: "Session complete", detail: "View summary", icon: "checkmark-circle-outline" as const };
    if (state.actionError) return { label: "Couldn't save session", detail: "Retry", icon: "alert-circle-outline" as const };
    return { label: "Saving session…", detail: "", icon: "sync-outline" as const };
  }
  return { label: state.isRunning ? "Session running" : "Session paused", detail: sessionTime(state.timeLeft), icon: state.isRunning ? "play-outline" as const : "pause-outline" as const };
}
