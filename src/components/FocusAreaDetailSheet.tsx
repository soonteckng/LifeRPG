import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView, TouchableOpacity } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "./AppSheet";
import { Text } from "./AppText";
import { Meter } from "./PersonalUI";
import { colors } from "../constants/theme";
import { readSuggestedFocus } from "../constants/guidedQuests";
import { readRoutineSession } from "../utils/routineSession";
import { focusAreaIcon, focusAreaTitle } from "../utils/focusAreas";
import { calendarLabel, dateKey, durationLabel } from "../utils/progressAnalytics";
import type { FocusAreaDetail } from "../utils/focusAreaDetail";

type Area = { id: number; title: string; level: number; current: number; required: number; color: string };
const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

export default function FocusAreaDetailSheet({ visible, area, detail, timeZone, sessionOpen, leaving = false, onFocus, onClose, onDismiss }: {
  visible: boolean; area: Area | null; detail: FocusAreaDetail | null; timeZone: string; sessionOpen: boolean; leaving?: boolean;
  onFocus: () => void; onClose: () => void; onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const title = focusAreaTitle(area?.title);
  const peak = Math.max(1, ...(detail?.days.map(day => day.seconds) ?? []));
  const time = (at: string) => new Intl.DateTimeFormat(undefined, { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(at));
  return <AppSheet visible={visible && !!area} onRequestClose={onClose} onDismiss={onDismiss} closeInstantly={leaving} label={`${title} focus area`}
    header={area && <View style={s.header}>
      <View style={[s.icon, { backgroundColor: `${area.color}22` }]}><Ionicons name={focusAreaIcon(area.title)} size={24} color={area.color} /></View>
      <View style={s.headerText}><Text style={s.title} numberOfLines={1}>{title}</Text><Text style={s.caption}>Level {area.level}</Text></View>
    </View>}
    footer={area && <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={sessionOpen ? "Return to your session" : `Start a session in ${title}`} onPress={onFocus} style={s.start}>
        <View style={s.play}><Ionicons name={sessionOpen ? "arrow-forward" : "play"} size={14} color={colors.primary} /></View>
        <Text style={s.startText}>{sessionOpen ? "Return to your session" : `Focus on ${title}`}</Text>
      </TouchableOpacity>
    </View>}>
    {area && detail && <BottomSheetScrollView enableFooterMarginAdjustment showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
      <View style={s.card} accessible accessibilityLabel={`${area.current} of ${area.required} XP. ${area.required - area.current} XP to level ${area.level + 1}`}>
        <View style={s.between}><Text style={s.label}>Next level</Text><Text style={s.caption}>{area.current} / {area.required} XP</Text></View>
        <Meter value={area.current / area.required} color={area.color} height={8} />
        <Text style={s.caption}>{area.required - area.current} XP to level {area.level + 1}</Text>
      </View>
      <View style={s.stats}>
        {[["This week", durationLabel(detail.weekSeconds)], ["All time", durationLabel(detail.seconds)], ["Sessions", String(detail.sessions)]].map(([label, value]) =>
          <View key={label} style={s.stat} accessible accessibilityLabel={`${label}, ${value}`}><Text style={s.statValue}>{value}</Text><Text style={s.caption}>{label}</Text></View>)}
      </View>
      <View style={s.card}>
        <View style={s.between}><Text style={s.label}>Day by day</Text>
          {detail.lastWeekByNow > 0 && <Text style={s.caption}>This point last week: {durationLabel(detail.lastWeekByNow)}</Text>}</View>
        <View style={s.bars} accessible accessibilityLabel={`This week: ${durationLabel(detail.weekSeconds)} in ${title}`}>
          {detail.days.map((day, index) => {
            const today = !day.future && detail.days[index + 1]?.future !== false;
            return <View key={day.day} style={s.barColumn}>
              <View style={s.barTrack}><View style={[s.bar, { height: `${day.seconds ? Math.max(8, day.seconds / peak * 100) : 0}%`, backgroundColor: area.color }]} /></View>
              <Text style={[s.weekday, today && s.today, day.future && s.future]}>{WEEKDAY[new Date(`${day.day}T12:00:00Z`).getUTCDay()]}</Text>
            </View>;
          })}
        </View>
      </View>
      <Text style={s.section}>Recent sessions</Text>
      {detail.recent.length ? detail.recent.map(session => {
        const name = readSuggestedFocus(session.notes)?.title ?? readRoutineSession(session.notes) ?? "Focus session";
        const when = `${calendarLabel(dateKey(new Date(session.completed_at!), timeZone))} · ${time(session.completed_at!)}`;
        return <View key={session.id} style={s.row} accessible accessibilityLabel={`${name}, ${durationLabel(session.duration_seconds)}, ${when}`}>
          <View style={s.headerText}><Text style={s.label} numberOfLines={1}>{name}</Text><Text style={s.caption}>{when}</Text></View>
          <Text style={s.caption}>{durationLabel(session.duration_seconds)}</Text>
        </View>;
      }) : <Text style={s.caption}>No sessions here yet. Your first one gets it growing.</Text>}
    </BottomSheetScrollView>}
  </AppSheet>;
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingBottom: 14 },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: "600", letterSpacing: -0.5 },
  caption: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  body: { paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
  card: { gap: 10, padding: 16, borderRadius: 20, backgroundColor: colors.sheetCard },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  label: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "500" },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, gap: 2, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 18, backgroundColor: colors.sheetCard },
  statValue: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "600", fontVariant: ["tabular-nums"] },
  bars: { flexDirection: "row", gap: 8, height: 92 },
  barColumn: { flex: 1, alignItems: "center", gap: 6 },
  barTrack: { flex: 1, width: "100%", maxWidth: 22, justifyContent: "flex-end", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.05)", overflow: "hidden" },
  bar: { width: "100%", borderRadius: 6 },
  weekday: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  today: { color: colors.text, fontWeight: "600" },
  future: { opacity: 0.45 },
  section: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "600", paddingTop: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 18, backgroundColor: colors.sheetCard },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.surfaceRaised },
  start: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 28, backgroundColor: colors.primary },
  play: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryText },
  startText: { color: colors.primaryText, fontSize: 17, lineHeight: 22, fontWeight: "600" },
});
