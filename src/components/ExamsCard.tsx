import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import ExamRow from "./ExamRow";
import SwipeRow from "./SwipeRow";
import ItemActionSheet from "./ItemActionSheet";
import { colors, edge, radius } from "../constants/theme";
import { countdownLabel, courseColor, daysUntil, examDateLabel } from "../utils/studyPlan";
import type { StudyCourse, StudyExam } from "../types/studyPlan";

const ROW = 68, SHOWN = 3.5;

/**
 * My Exams in Study: one card that scrolls inside itself after three and a
 * half rows, so exam season never makes the page endless. Rows behave like
 * routines: tap to edit, Study to start, hold for more, swipe for Edit/Remove.
 */
export default function ExamsCard({ exams, courses, onEdit, onStudy, onRemove }: {
  exams: StudyExam[]; courses: StudyCourse[]; onEdit: (exam: StudyExam) => void; onStudy: (course: StudyCourse) => void; onRemove: (id: string) => Promise<boolean>;
}) {
  const [menu, setMenu] = useState<{ exam: StudyExam; mode: "options" | "remove" } | null>(null);
  const [shown, setShown] = useState<{ exam: StudyExam; mode: "options" | "remove" } | null>(null);
  if (menu && menu !== shown) setShown(menu);
  const courseFor = (id: string | null) => courses.find(item => item.id === id) ?? null;
  const after = (work: () => void) => { setMenu(null); setTimeout(work, 220); };
  const current = menu ?? shown, course = current ? courseFor(current.exam.courseId) : null;
  const scrolls = exams.length > SHOWN;
  return <>
    <View style={[s.card, scrolls && { height: Math.round(ROW * SHOWN) }]} testID="exams-card">
      <ScrollView nestedScrollEnabled scrollEnabled={scrolls} showsVerticalScrollIndicator={scrolls}>
        {exams.map((exam, index) => {
          const owner = courseFor(exam.courseId);
          return <SwipeRow key={exam.id} enabled label={exam.title} onEdit={() => onEdit(exam)} onRemove={() => setMenu({ exam, mode: "remove" })}>
            <ExamRow exam={exam} course={owner} first={index === 0} onPress={() => onEdit(exam)} onLongPress={() => setMenu({ exam, mode: "options" })}
              onStudy={owner ? () => onStudy(owner) : undefined} label="Edit exam" />
          </SwipeRow>;
        })}
      </ScrollView>
    </View>
    <ItemActionSheet visible={!!menu} label={menu?.mode === "remove" ? "remove exam" : "exam options"} mode={current?.mode ?? "options"}
      title={current?.exam.title ?? ""} tint={course ? courseColor(course.id) : undefined}
      meta={current ? `${countdownLabel(daysUntil(current.exam.examDate))} · ${examDateLabel(current.exam.examDate)}${course ? ` · ${course.name}` : ""}` : ""}
      removeNote="The subject and its study time stay saved." removeLabel="Remove exam" keepLabel="Keep exam"
      actions={current ? [
        ...(course ? [{ label: `Study ${course.name}`, icon: "play" as const, onPress: () => after(() => onStudy(course)) }] : []),
        { label: "Edit exam", icon: "create-outline" as const, onPress: () => after(() => onEdit(current.exam)) },
        { label: "Remove exam", icon: "trash-outline" as const, danger: true, onPress: () => setMenu({ exam: current.exam, mode: "remove" }) },
      ] : []}
      onRemove={() => { const exam = current?.exam; setMenu(null); if (exam) void onRemove(exam.id); }}
      onClose={() => setMenu(null)} onDismiss={() => setShown(null)} />
  </>;
}
const s = StyleSheet.create({
  card: { ...edge, borderRadius: radius.card, backgroundColor: colors.surface, overflow: "hidden" },
});
