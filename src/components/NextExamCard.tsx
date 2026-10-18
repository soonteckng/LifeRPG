import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Pressable from "./MotionPressable";
import { Text } from "./AppText";
import { colors, radius } from "../constants/theme";
import { useStudyPlan } from "../hooks/useStudyPlan";
import { countdownLabel, daysUntil, examDateLabel, upcomingExams } from "../utils/studyPlan";

/** Home's quiet reminder of the next exam. Nothing renders when none is coming up. */
export default function NextExamCard() {
  const router = useRouter();
  const { exams, courses } = useStudyPlan();
  const next = upcomingExams(exams)[0];
  if (!next) return null;
  const days = daysUntil(next.examDate), subject = courses.find(item => item.id === next.courseId);
  return <Pressable testID="home-next-exam" onPress={() => router.navigate("/study")} accessibilityRole="button"
    accessibilityLabel={`${next.title}, ${countdownLabel(days)}, ${examDateLabel(next.examDate)}. Open Study`} style={s.card}>
    <View style={s.days}>
      {days > 0 ? <><Text style={s.number}>{days}</Text><Text style={s.unit}>{days === 1 ? "day" : "days"}</Text></> : <Text style={s.soon}>Today</Text>}
    </View>
    <View style={s.copy}>
      <Text style={s.title} numberOfLines={1}>{next.title}</Text>
      <Text style={s.caption} numberOfLines={1}>{subject ? `${subject.name} · ` : ""}{examDateLabel(next.examDate)}</Text>
    </View>
    <Ionicons name="chevron-forward" size={15} color={colors.tertiary} />
  </Pressable>;
}
const s = StyleSheet.create({
  card: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.card, backgroundColor: colors.surface },
  days: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,105,97,0.14)" },
  number: { color: colors.danger, fontSize: 20, lineHeight: 22, fontWeight: "800", fontVariant: ["tabular-nums"] },
  unit: { color: colors.danger, fontSize: 12, lineHeight: 15, fontWeight: "600" },
  soon: { color: colors.danger, fontSize: 13, lineHeight: 16, fontWeight: "700" },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  title: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
});
