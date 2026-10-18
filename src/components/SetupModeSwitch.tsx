import { useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import Segmented from "./Segmented";
import { setupMode, type SetupMode } from "../services/setupMode";

const OPTIONS: { value: SetupMode; label: string; accessibilityLabel: string }[] = [
  { value: "focus", label: "Focus", accessibilityLabel: "Focus. Any activity in a focus area" },
  { value: "routine", label: "Routine", accessibilityLabel: "Routine. One of your saved routines" },
  { value: "study", label: "Study", accessibilityLabel: "Study. A subject, counted toward its exams" },
];

export function useSetupMode(): SetupMode {
  return useSyncExternalStore(setupMode.subscribe, setupMode.get, setupMode.get);
}

/** The one switch every session setup starts with: Focus, Routine or Study. */
export default function SetupModeSwitch({ value, disabled = false, onChange }: { value: SetupMode; disabled?: boolean; onChange?: (mode: SetupMode) => void }) {
  return <View style={s.wrap} testID="setup-mode-switch">
    <Segmented value={value} disabled={disabled} options={OPTIONS} onChange={next => { setupMode.choose(next); onChange?.(next); }} />
  </View>;
}
const s = StyleSheet.create({ wrap: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 6 } });
