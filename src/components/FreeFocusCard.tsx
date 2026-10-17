import type { Subject } from "../services/taskService";
import type { ReactNode } from "react";
import FocusCard from "./FocusCard";
export default function FreeFocusCard({ seconds, duration, customSeconds, area, areaId = null, subjects = [], tint, active, running, awaitingStart, finishing, starting, disabled, changeDisabled, restoring, failed, error, setupError, onChange, onStart, onDuration, onCustomDuration, onPreferences, goal, protection }: {
  seconds: number; duration?: number; area: string; areaId?: number | null; subjects?: Subject[]; tint: string; active: boolean; running: boolean;
  starting: boolean; disabled: boolean; changeDisabled: boolean; restoring: boolean; awaitingStart?: boolean; finishing?: boolean;
  failed: boolean; error?: string; setupError?: string; onChange: (id: number | null) => void; onStart: () => void; onDuration: (seconds: number) => void;
  customSeconds?: number | null; onCustomDuration?: (seconds: number) => void;
  onPreferences?: () => void;
  goal?: ReactNode; protection?: ReactNode;
}) {
  return <FocusCard cardID="home-quick-start" startID="home-start-focus" areaActionID="home-change-focus"
    label="Free focus" title="One thing at a time." contentKey={active ? "active" : "free"}
    instruction={awaitingStart ? "We’re checking your session start. Open it to review or end the request." : active ? running ? "Your block is in progress. Return to your session whenever you’re ready." : "Your session is paused. Continue when you’re ready; your time and Focus area are kept." : "Choose one thing you’d like to work on. Set a time that feels manageable, settle in, and give it your attention for this block."}
    seconds={seconds} duration={duration} area={area} tint={tint} active={active} running={running} awaitingStart={awaitingStart} finishing={finishing}
    setupDisabled={changeDisabled} busy={starting} disabled={disabled} editDisabled={changeDisabled || disabled} restoring={restoring}
    failed={failed} error={setupError ?? (failed ? error ?? "Couldn't start. Please try again." : undefined)}
    subjects={subjects} areaId={areaId} onArea={onChange} onStart={onStart} onDuration={onDuration} customSeconds={customSeconds} onCustomDuration={onCustomDuration} onPreferences={onPreferences} goal={goal} protection={protection} />;
}
