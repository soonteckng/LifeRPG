import { tapHaptic } from "../utils/tapHaptics";
import { View } from "react-native";
import { colors } from "../constants/theme";
import { useState } from "react";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import SheetButton from "./SheetTouchable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import GuidedChoice from "./GuidedChoice";
import { Text } from "./AppText";
import { p } from "./PersonalUI";
import type { GuidedPreference } from "../services/guidedPreferenceService";
import { useGuidedPreference } from "../hooks/useGuidedPreference";
import { useUser } from "../context/UserContext";
export default function GuidedPreferenceSheet({ owner, visible, onClose }: { owner: string; visible: boolean; onClose: () => void }) {
  const preference = useGuidedPreference(owner);
  const { hapticsEnabled } = useUser();
  const feedback = () => { if (hapticsEnabled) tapHaptic(); };
  const [draft, setDraft] = useState<GuidedPreference | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) { setWasVisible(visible); if (visible) setDraft(null); }
  const choice = draft ?? preference.value;
  const insets = useSafeAreaInsets();
  return <AppSheet visible={visible} onRequestClose={() => { if (!preference.busy) onClose(); }} guardDismiss={preference.busy} label="focus suggestions" compact maxHeightRatio={0.85} motionMode="timed"
    header={<SheetHeader title="Choose your focus" subtitle="Pick a category and a first step, or just focus." onClose={() => { if (!preference.busy) onClose(); }} />}
    footer={<View testID="guided-preference-footer" style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 12, backgroundColor: colors.surfaceRaised }}>
      <SheetButton testID="save-guided-preferences" accessibilityRole="button" disabled={preference.busy || !preference.ready} onPress={() => { void preference.save({ ...choice, invited: true }).then(saved => { if (saved) onClose(); }); }} style={p.button}><Text style={p.buttonText}>{preference.busy ? "Saving…" : "Save preferences"}</Text></SheetButton>
    </View>}>
    <BottomSheetScrollView enableFooterMarginAdjustment showsVerticalScrollIndicator contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
      <GuidedChoice value={choice} onChange={setDraft} disabled={preference.busy || !preference.ready} onSelection={feedback} />
      {preference.error && <><Text style={p.error} accessibilityRole="alert">Couldn’t save or load your suggestion preferences. Try again.</Text>{!preference.ready && <SheetButton onPress={() => void preference.retry()} accessibilityRole="button"><Text style={p.rowTitle}>Retry loading</Text></SheetButton>}</>}

    </BottomSheetScrollView>
  </AppSheet>;
}
