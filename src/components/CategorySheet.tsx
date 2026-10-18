import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { StyleSheet } from "react-native";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";
import FocusAreaPicker from "./FocusAreaPicker";
import { focusAreaChoices, focusAreaTitle, generalArea } from "../utils/focusAreas";
import type { Subject } from "../services/taskService";

/** Choose where a session's time counts. Everyday focus always comes first. */
export function categoryChoices(subjects: Subject[], selectedId?: number | null) {
  const general = generalArea(subjects);
  return [{ id: general?.id ?? null, title: "Everyday focus", color_code: general?.color_code ?? null },
    ...focusAreaChoices(subjects, selectedId).filter(item => focusAreaTitle(item.title) !== "Everyday focus")];
}
export default function CategorySheet({ visible, subjects, selectedId, disabled = false, onChoose, onClose }: {
  visible: boolean; subjects: Subject[]; selectedId: number | null; disabled?: boolean; onChoose: (id: number | null) => void; onClose: () => void;
}) {
  return <AppSheet visible={visible} onRequestClose={onClose} floating compact maxHeightRatio={0.86} label="category" motionMode="timed"
    header={<SheetHeader title="Category" subtitle="Where should this time count?" onClose={onClose} />}>
    <BottomSheetScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <FocusAreaPicker areas={categoryChoices(subjects, selectedId)} selectedId={selectedId} disabled={disabled} onSelect={id => { onChoose(id); onClose(); }} />
    </BottomSheetScrollView>
  </AppSheet>;
}
const s = StyleSheet.create({ body: { paddingHorizontal: 16, paddingBottom: 18 } });
