import { useState } from "react";
import { BottomSheetScrollView, TouchableOpacity as SheetButton } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import GuidedChoice from "./GuidedChoice";
import { Text } from "./AppText";
import { p } from "./PersonalUI";
import type { GuidedPreference } from "../services/guidedPreferenceService";
import { useGuidedPreference } from "../hooks/useGuidedPreference";
export default function GuidedPreferenceSheet({ owner, visible, onClose }: { owner: string; visible: boolean; onClose: () => void }) {
  const preference = useGuidedPreference(owner);
  const [draft, setDraft] = useState<GuidedPreference | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) { setWasVisible(visible); if (visible) setDraft(null); }
  const choice = draft ?? preference.value;
  const insets = useSafeAreaInsets();
  return <AppSheet visible={visible} onRequestClose={() => { if (!preference.busy) onClose(); }} guardDismiss={preference.busy} label="focus suggestions" compact maxHeightRatio={0.85}
    header={<Text style={[p.title, { paddingHorizontal: 20, paddingBottom: 12 }]}>Find your next step</Text>}>
    <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 16 }}>
      <Text style={p.body}>Suggestions are optional. Your quests and progress stay with you when you change direction.</Text>
      <GuidedChoice value={choice} onChange={setDraft} disabled={preference.busy || !preference.ready} />
      {preference.error && <><Text style={p.error} accessibilityRole="alert">Couldn’t save or load your suggestion preferences. Try again.</Text>{!preference.ready && <SheetButton onPress={() => void preference.retry()} accessibilityRole="button"><Text style={p.rowTitle}>Retry loading</Text></SheetButton>}</>}
      <SheetButton accessibilityRole="button" disabled={preference.busy || !preference.ready} onPress={() => { void preference.save({ ...choice, invited: true }).then(saved => { if (saved) onClose(); }); }} style={p.button}><Text style={p.buttonText}>{preference.busy ? "Saving…" : "Save preferences"}</Text></SheetButton>
    </BottomSheetScrollView>
  </AppSheet>;
}
