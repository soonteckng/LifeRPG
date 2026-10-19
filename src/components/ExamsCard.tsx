import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import ExamRow from "./ExamRow";
import ItemActionSheet from "./ItemActionSheet";
import { Wiggle } from "./EditMode";
import { colors, edge } from "../constants/theme";
import { countdownLabel, courseColor, daysUntil, examDateLabel } from "../utils/studyPlan";
import type { StudyCourse, StudyExam } from "../types/studyPlan";

const ROW = 68 + 8, SHOWN = 3.5;

/**
 * My Exams: each exam is its own small card. After three and a half the list
 * scrolls inside itself, so exam season never makes the page endless.
 * Cards behave like subjects and routines: tap to edit, Study to start, hold
 * to wiggle into edit mode with ✎ and −.
 */
export default function ExamsCard({ exams, courses, onEdit, onStudy, onRemove, editing = false, onEditingChange }: {
  exams: StudyExam[]; courses: StudyCourse[]; onEdit: (exam: StudyExam) => void; onStudy: (course: StudyCourse) => void; onRemove: (id: string) => Promise<boolean>;
  editing?: boolean; onEditingChange?: (editing: boolean) => void;
}) {
  const [removing, setRemoving] = useState<StudyExam | null>(null);
  const [shown, setShown] = useState<StudyExam | null>(null);
  if (removing && removing !== shown) setShown(removing);
  const courseFor = (id: string | null) => courses.find(item => item.id === id) ?? null;
  const current = removing ?? shown, course = current ? courseFor(current.courseId) : null;
  const scrolls = exams.length > SHOWN;
  const finish = () => onEditingChange?.(false);
  return <>
    <View style={[s.list, scrolls && { height: Math.round(ROW * SHOWN) }]} testID="exams-card">
      <ScrollView nestedScrollEnabled scrollEnabled={scrolls} showsVerticalScrollIndicator={scrolls} contentContainerStyle={s.stack}>
        {exams.map(exam => {
          const owner = courseFor(exam.courseId);
          return <Wiggle key={exam.id} active={editing} seed={exam.id} degrees={0.4} style={s.item}>
            <ExamRow exam={exam} course={owner} first editing={editing} label="Edit exam"
              onPress={() => editing ? finish() : onEdit(exam)} onLongPress={onEditingChange ? () => onEditingChange(true) : undefined}
              onStudy={owner ? () => onStudy(owner) : undefined}
              onEdit={() => { finish(); onEdit(exam); }} onRemove={() => setRemoving(exam)} />
          </Wiggle>;
        })}
      </ScrollView>
    </View>
    <ItemActionSheet visible={!!removing} label="remove exam" mode="remove" actions={[]}
      title={current?.title ?? ""} tint={course ? courseColor(course.id) : undefined}
      meta={current ? `${countdownLabel(daysUntil(current.examDate))} · ${examDateLabel(current.examDate)}${course ? ` · ${course.name}` : ""}` : ""}
      removeNote="The subject and its study time stay saved." removeLabel="Remove exam" keepLabel="Keep exam"
      onRemove={() => { const exam = removing; setRemoving(null); if (exam) void onRemove(exam.id); }}
      onClose={() => setRemoving(null)} onDismiss={() => setShown(null)} />
  </>;
}
const s = StyleSheet.create({
  list: { overflow: "hidden" }, stack: { gap: 8 },
  item: { ...edge, borderRadius: 18, backgroundColor: colors.surface, overflow: "hidden" },
});
