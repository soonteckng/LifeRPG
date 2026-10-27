import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./AppText";
import { colors, edge } from "../constants/theme";
import { listSessionCourses } from "../services/studyPlanService";
import { courseColor } from "../utils/studyPlan";
import { durationLabel } from "../utils/progressAnalytics";
import type { ProgressSession } from "../services/progressService";
import type { StudySessionCourse } from "../types/studyPlan";

const WINDOW = 44 * 86_400_000;
// One lookup per owner and window, shared by Progress and Profile.
const cache = new Map<string, Promise<StudySessionCourse[]>>();
function lookup(owner: string, from: number, to: number) {
  const key = `${owner}:${from}:${to}`;
  if (!cache.has(key)) {
    if (cache.size > 12) cache.clear();
    const request = listSessionCourses(owner, new Date(from), new Date(to));
    request.catch(() => cache.delete(key));
    cache.set(key, request);
  }
  return cache.get(key)!;
}
/** Seconds per subject for these sessions, most first; untagged time is "Other". */
export function subjectSeconds(sessions: ProgressSession[], links: StudySessionCourse[]) {
  const byId = new Map(links.map(link => [link.clientSessionId, link]));
  const totals = new Map<string, { courseId: string | null; name: string; seconds: number }>();
  for (const session of sessions) {
    const link = session.client_session_id ? byId.get(session.client_session_id) : undefined;
    const key = link?.courseId ?? "other";
    const row = totals.get(key) ?? { courseId: link?.courseId ?? null, name: link?.name ?? "Other", seconds: 0 };
    row.seconds += session.duration_seconds; totals.set(key, row);
  }
  return [...totals.values()].sort((a, b) => (a.courseId ? 0 : 1) - (b.courseId ? 0 : 1) || b.seconds - a.seconds);
}

/**
 * Revision or Learning, by subject: which subjects these sessions were for.
 * Looks back up to 44 days from the newest session.
 */
export default function SubjectBreakdown({ owner, sessions }: { owner: string; sessions: ProgressSession[] }) {
  const stamps = sessions.map(session => Date.parse(session.completed_at ?? "")).filter(Number.isFinite);
  const to = stamps.length ? Math.max(...stamps) + 1000 : 0, from = stamps.length ? Math.max(Math.min(...stamps) - 1000, to - WINDOW) : 0;
  const [state, setState] = useState<{ key: string; links: StudySessionCourse[] | null; failed: boolean }>({ key: "", links: null, failed: false });
  const key = `${owner}:${from}:${to}`;
  useEffect(() => {
    if (!owner || !stamps.length) return;
    let live = true;
    lookup(owner, from, to).then(links => { if (live) setState({ key, links, failed: false }); }, () => { if (live) setState({ key, links: null, failed: true }); });
    return () => { live = false; };
    // The window key covers the sessions that matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const rows = useMemo(() => state.key === key && state.links ? subjectSeconds(sessions, state.links) : [], [state, key, sessions]);
  if (!sessions.length) return null;
  const total = Math.max(1, rows.reduce((sum, row) => sum + row.seconds, 0));
  return <View style={s.card} testID="subject-breakdown">
    <Text style={s.label}>By subject</Text>
    {state.key !== key || !state.links ? <Text style={s.caption}>{state.key === key && state.failed ? "Couldn’t load subjects. Reconnect and try again." : "Loading subjects…"}</Text>
      : rows.map((row, index) => <View key={row.courseId ?? "other"} style={[s.row, index > 0 && s.line]} accessible accessibilityLabel={`${row.name}, ${durationLabel(row.seconds)}`}>
        <View style={[s.dot, { backgroundColor: row.courseId ? courseColor(row.courseId) : colors.tertiary }]} />
        <Text style={s.name} numberOfLines={1}>{row.name}</Text>
        <View style={s.track}><View style={[s.fill, { width: `${Math.max(4, Math.round(100 * row.seconds / total))}%`, backgroundColor: row.courseId ? courseColor(row.courseId) : colors.tertiary }]} /></View>
        <Text style={s.value}>{durationLabel(row.seconds)}</Text>
      </View>)}
  </View>;
}
const s = StyleSheet.create({
  card: { ...edge, padding: 14, gap: 4, borderRadius: 20, backgroundColor: colors.sheetCard },
  label: { color: colors.secondary, fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 },
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  row: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 10 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  dot: { width: 9, height: 9, borderRadius: 5 },
  name: { width: "34%", color: colors.text, fontSize: 15, fontWeight: "500" },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.selection, overflow: "hidden" }, fill: { height: 6, borderRadius: 3 },
  value: { minWidth: 56, textAlign: "right", color: colors.secondary, fontSize: 14, fontVariant: ["tabular-nums"] },
});
