import SaveSuggestedQuest from "./SaveSuggestedQuest";
import SessionResultSheet, { type SessionResultSheetProps } from "./SessionResultSheet";

/** Existing online callers share the same result surface as offline recovery. */
export default function LevelUpModal(props: SessionResultSheetProps) {
  return <SessionResultSheet {...props} saveAction={props.saveAction ?? <SaveSuggestedQuest inSheet compact />} />;
}
