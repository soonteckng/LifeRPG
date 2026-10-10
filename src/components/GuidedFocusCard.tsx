import { suggestedArea } from "../utils/focusAreas";
import { useEffect, useRef, useState } from "react";
import FocusCard from "./FocusCard";
import { suggestedFocus, suggestedFocusAreaKey, readSuggestedFocus, type SuggestedFocus } from "../constants/guidedQuests";
import { validSessionSeconds } from "../utils/sessionSetup";
import { lifeAreaColor } from "../utils/lifeAreaColor";
import { useGuidedPreference } from "../hooks/useGuidedPreference";
import { preferenceForFocusArea } from "../utils/focusPreference";
import { useTimer } from "../context/TimerContext";
import type { Subject } from "../services/taskService";
export default function GuidedFocusCard({ owner, subjects, activeTitle, disabled, onStarted, selectedSeconds, onDuration }: {
  owner: string; subjects: Subject[]; activeTitle?: string; disabled: boolean; onStarted: () => void; selectedSeconds?: number; onDuration?: (seconds: number) => void;
}) {
  const preference = useGuidedPreference(owner), timer = useTimer();
  const [selection, setSelection] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [areaChanging, setAreaChanging] = useState(false);
  const [areaError, setAreaError] = useState(false);
  const [failed, setFailed] = useState<{ defaults: typeof preference.value; focus: SuggestedFocus; areaId: number | null; areaTitle: string } | null>(null);
  const lock = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const seconds = selectedSeconds ?? selection ?? suggestedFocus(preference.value.templateId, preference.value.smaller)?.seconds ?? 1800;
  const keptFailure = failed?.defaults === preference.value ? failed : null;
  const focus = keptFailure?.focus ?? { ...suggestedFocus(preference.value.templateId, seconds === 600)!, seconds };
  const area = (preference.value.areaId !== undefined ? subjects.find(item => item.id === preference.value.areaId) : undefined) ?? suggestedArea(subjects, suggestedFocusAreaKey(focus.templateId));
  const areaId = keptFailure ? keptFailure.areaId : area?.id ?? null, areaTitle = keptFailure?.areaTitle ?? area?.title ?? "General";
  const locked = disabled || busy || preference.busy || areaChanging;
  const active = !!timer.hasOpenSession, activeSuggestion = active ? readSuggestedFocus(timer.notes) : null;
  const activeArea = subjects.find(item => item.id === timer.targetAttributeId);
  const chooseDuration = (next: number) => {
    if (lock.current || locked || active || !validSessionSeconds(next)) return;
    setSelection(next); setFailed(null); onDuration?.(next);
  };
  const start = async () => {
    if (lock.current || busy) return;
    if (active) { onStarted(); return; }
    if (disabled || preference.busy) return;
    lock.current = true; setBusy(true);
    try {
      const request = timer.startSuggestedTimer(focus, areaId);
      onStarted();
      const started = await request;
      if (alive.current) { if (started) setFailed(null); else setFailed({ defaults: preference.value, focus, areaId, areaTitle }); }
    } catch { if (alive.current) setFailed({ defaults: preference.value, focus, areaId, areaTitle }); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const chooseArea = async (id: number | null) => {
    if (lock.current || locked || active) return;
    const selected = subjects.find(item => item.id === id);
    if (id !== null && !selected) return;
    lock.current = true; setSelection(seconds); setAreaChanging(true); setAreaError(false);
    try {
      const saved = await preference.save(preferenceForFocusArea(preference.value, id, selected?.title ?? "Everyday focus"));
      if (saved) { onDuration?.(seconds); if (alive.current) setFailed(null); }
      else if (alive.current) setAreaError(true);
    } catch { if (alive.current) setAreaError(true); }
    finally { lock.current = false; if (alive.current) setAreaChanging(false); }
  };
  return <FocusCard cardID="guided-focus-card" startID="guided-start" areaActionID="guided-session-options"
    label="Suggested focus" title={active ? activeSuggestion?.title ?? activeTitle ?? "One thing at a time." : focus.title}
    instruction={active ? activeSuggestion?.instruction ?? (timer.isRunning ? "Your block is in progress. Return to your session whenever you’re ready." : "Your session is paused. Continue whenever you’re ready.") : focus.instruction}
    contentKey={active ? "active" : focus.templateId + String(focus.smaller)}
    seconds={active ? timer.timeLeft : focus.seconds} area={active ? activeArea?.title ?? "General" : areaTitle}
    tint={lifeAreaColor(active ? timer.targetAttributeId : areaId, (active ? activeArea : area)?.color_code)}
    active={active} running={!!timer.isRunning} busy={busy} disabled={locked} editDisabled={locked}
    setupDisabled={busy || areaChanging || !!timer.actionBusy || preference.busy} restoring={!!timer.isRestoring} failed={!active && !!keptFailure} error={!active && keptFailure ? timer.actionError ?? "Couldn’t start. Your suggestion is kept for retry." : areaError ? "Couldn’t change your focus area. Your previous choice is still selected. Try again." : preference.error ? "Couldn’t load your preferences. Try Find your next step again." : undefined}
    subjects={subjects} areaId={active ? timer.targetAttributeId : areaId} onDuration={chooseDuration} onArea={id => void chooseArea(id)} onStart={() => void start()} />;
}
