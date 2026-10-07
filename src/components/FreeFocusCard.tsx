import FocusCard from "./FocusCard";
export default function FreeFocusCard({ seconds, area, tint, active, running, starting, disabled, changeDisabled, restoring, failed, error, onChange, onStart, onDuration }: {
  seconds: number; area: string; tint: string; active: boolean; running: boolean;
  starting: boolean; disabled: boolean; changeDisabled: boolean; restoring: boolean;
  failed: boolean; error?: string; onChange: () => void; onStart: () => void; onDuration: (seconds: number) => void;
}) {
  return <FocusCard cardID="home-quick-start" startID="home-start-focus" areaActionID="home-change-focus"
    label="Free focus" title="One thing at a time." contentKey={active ? "active" : "free"}
    instruction={active ? running ? "Your block is in progress. Return to your session whenever you’re ready." : "Your session is paused. Continue when you’re ready; your time and Life area are kept." : "Choose one thing you’d like to work on. Set a time that feels manageable, settle in, and give it your attention for this block."}
    seconds={seconds} area={area} tint={tint} active={active} running={running}
    setupDisabled={changeDisabled} busy={starting} disabled={disabled} editDisabled={changeDisabled || disabled} restoring={restoring}
    failed={failed} error={failed ? error ?? "Couldn't start. Please try again." : undefined}
    onSetup={onChange} onStart={onStart} onDuration={onDuration} />;
}
