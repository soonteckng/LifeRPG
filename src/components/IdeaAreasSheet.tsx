import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import IdeaAreaPicker from "./IdeaAreaPicker";
import Pressable from "./SheetTouchable";
import { Text } from "./AppText";
import { colors } from "../constants/theme";
import { useGuidedPreference } from "../hooks/useGuidedPreference";
import type { IdeaArea } from "../constants/routineIdeas";

/** Routines › For you › Change: the same calm picker as the intro, saved on Done. */
export default function IdeaAreasSheet({ owner, visible, onClose }: { owner: string; visible: boolean; onClose: () => void }) {
  const preference = useGuidedPreference(owner);
  const [draft, setDraft] = useState<IdeaArea[] | null>(null), [error, setError] = useState(""), [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) { setWasVisible(visible); if (visible) { setDraft(null); setError(""); } }
  const picked = draft ?? preference.value.ideaAreas ?? [];
  const done = async () => {
    if (preference.busy) return;
    if (draft && preference.ready && !(await preference.save({ ...preference.value, ideaAreas: draft }))) {
      setError("Couldn’t save your choice. Please try again."); return;
    }
    onClose();
  };
  // Done stays pinned under the list, so it is always in reach on any phone.
  return <AppSheet visible={visible} onRequestClose={() => void done()} compact maxHeightRatio={0.9} label="ideas for you" motionMode="timed"
    header={<SheetHeader title="Ideas for you" subtitle="Choose up to three things to make time for." onClose={() => void done()} closeLabel="Done" />}
    footer={<View style={s.footer}>
      {!!error && <Text style={s.error} accessibilityRole="alert">{error}</Text>}
      <Pressable onPress={() => void done()} disabled={preference.busy} accessibilityRole="button" accessibilityLabel="Done" style={s.done}>
        <Text style={s.doneText}>Done</Text>
      </Pressable>
    </View>}>
    <BottomSheetScrollView enableFooterMarginAdjustment contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <IdeaAreaPicker value={picked} onChange={setDraft} disabled={!preference.ready || preference.busy} inSheet />
    </BottomSheetScrollView>
  </AppSheet>;
}
const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 12 },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16, gap: 10, backgroundColor: colors.surfaceRaised },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  done: { minHeight: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  doneText: { color: colors.primaryText, fontSize: 17, fontWeight: "600" },
});
