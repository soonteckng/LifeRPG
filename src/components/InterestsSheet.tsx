import { useState } from "react";
import { StyleSheet } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import InterestPicker from "./InterestPicker";
import Pressable from "./SheetTouchable";
import { Text } from "./AppText";
import { colors } from "../constants/theme";
import { useGuidedPreference } from "../hooks/useGuidedPreference";
import { interestsOf, withInterests } from "../utils/interests";
import type { InterestKind } from "../constants/guidedQuests";

/** Settings › Your interests: the same picker as onboarding, saved when you're done. */
export default function InterestsSheet({ owner, visible, onClose }: { owner: string; visible: boolean; onClose: () => void }) {
  const preference = useGuidedPreference(owner), insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<InterestKind[] | null>(null), [error, setError] = useState(""), [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) { setWasVisible(visible); if (visible) { setDraft(null); setError(""); } }
  const picked = draft ?? interestsOf(preference.value);
  const done = async () => {
    if (preference.busy) return;
    if (draft && preference.ready) {
      const saved = await preference.save(withInterests(preference.value, draft));
      if (!saved) { setError("Couldn’t save your interests. Please try again."); return; }
    }
    onClose();
  };
  return <AppSheet visible={visible} onRequestClose={() => void done()} attached compact label="your interests" motionMode="timed"
    header={<SheetHeader title="Your interests" subtitle="Ideas from these come first. Pick none to see them all equally." onClose={() => void done()} closeLabel="Done" />}>
    <BottomSheetScrollView contentContainerStyle={[s.body, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} showsVerticalScrollIndicator={false}>
      <InterestPicker value={picked} onChange={setDraft} disabled={!preference.ready || preference.busy} inSheet />
      {!!error && <Text style={s.error} accessibilityRole="alert">{error}</Text>}
      <Pressable onPress={() => void done()} disabled={preference.busy} accessibilityRole="button" accessibilityLabel="Done" style={s.done}>
        <Text style={s.doneText}>Done</Text>
      </Pressable>
    </BottomSheetScrollView>
  </AppSheet>;
}
const s = StyleSheet.create({
  body: { paddingHorizontal: 16, gap: 14 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  done: { minHeight: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  doneText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" },
});
