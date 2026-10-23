import { focusAreaTitle, focusAreaIcon, focusAreaKind } from "../utils/focusAreas";
import { PROFILE_NAME_LIMIT, PROFILE_NAME_TAKEN, profileNameError } from "../constants/profile";
import Pressable from "../components/MotionPressable";
import { useTimer } from "../context/TimerContext";
import { Text } from "../components/AppText";
import ContentReveal from "../components/ContentReveal";
import { areaTint, lifeAreaColor } from "../utils/lifeAreaColor";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetScrollView,
  type BottomSheetScrollViewMethods,
} from "@gorhom/bottom-sheet";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Keyboard, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { levelTierProgress, requiredCharacterXP } from "../utils/levelTiers";
import ProgressRing from "../components/ProgressRing";
import MilestonesSheet, { useMilestones } from "../components/MilestonesSheet";
import SubjectBreakdown from "../components/SubjectBreakdown";
import SectionHeader from "../components/SectionHeader";
import LevelTierSheet from "../components/LevelTierSheet";
import FocusAreaDetailSheet from "../components/FocusAreaDetailSheet";
import { focusAreaDetail } from "../utils/focusAreaDetail";
import AppSheet from "../components/AppSheet";
import SheetConfirmation from "../components/SheetConfirmation";
import CharacterPortrait from "../components/CharacterPortrait";
import {
  Meter,
  PersonalButton,
  PersonalPage,
  p,
} from "../components/PersonalUI";
import { colors, radius, edge } from "../constants/theme";
import { useUser } from "../context/UserContext";
import { useAuth } from "../context/AuthContext";
import { useCharacterData } from "../hooks/useCharacterData";
import { profileFocusAreaGrowth } from "../utils/characterGrowth";
import { useStudyPlan } from "../hooks/useStudyPlan";
import { setupMode } from "../services/setupMode";
import { countdownLabel, courseColor, daysUntil, studyTime, upcomingExams } from "../utils/studyPlan";

import CharacterLookPicker from "../components/CharacterLookPicker";
import { characterLook } from "../utils/characterAppearance";
import SheetTextInput from "../components/SheetTextInput";
export default function ProfileScreen() {
  const router = useRouter();
  const milestones = useMilestones();
  const [openedAt] = useState(() => Date.now());
  const [badgesOpen, setBadgesOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const timer = useTimer({ live: false });
  const { profile, updateProfile, reloadProfile } = useUser();
  const { accessMode, admissionEpoch } = useAuth();
  const online = accessMode === "online";
  const saveView = useMemo(() => ({ owner: profile.id, accessMode, admissionEpoch }), [profile.id, accessMode, admissionEpoch]);
  const currentSaveView = useRef<typeof saveView | null>(saveView);
  useLayoutEffect(() => {
    currentSaveView.current = saveView;
    return () => { currentSaveView.current = null; };
  }, [saveView]);
  const { data, loading, error, refresh } = useCharacterData();
  const study = useStudyPlan();
  const nameScroll = useRef<BottomSheetScrollViewMethods>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const sheetClosing = useRef(false);
  const [saveError, setSaveError] = useState("");
  const [discard, setDiscard] = useState(false);
  const [tiersOpen, setTiersOpen] = useState(false);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [areaOpen, setAreaOpen] = useState(false);
  const [leavingArea, setLeavingArea] = useState(false);
  const afterArea = useRef<(() => void) | null>(null);
  useFocusEffect(
    useCallback(() => {
      void reloadProfile();
    }, [reloadProfile]),
  );
  const areas = profileFocusAreaGrowth(data?.areas ?? []);
  const required = requiredCharacterXP(profile.level);
  const selectedArea = areas.find(area => area.id === areaId) ?? null;
  const areaDetail = selectedArea && data ? focusAreaDetail(selectedArea, data.areas, data.sessions, profile.timezone) : null;
  const selectedKind = focusAreaKind(selectedArea?.title);
  // Learning and Revision show which subjects their time went to, over the last six weeks.
  const recentAreaSessions = selectedArea && data && (selectedKind === "learning" || selectedKind === "revision")
    ? data.sessions.filter(session => session.subject_id === selectedArea.id && Date.parse(session.completed_at ?? "") > openedAt - 44 * 86_400_000) : [];
  const focusArea = () => {
    if (!selectedArea) return;
    // Revision only comes from studying a subject with an exam.
    if (selectedKind === "revision") { afterArea.current = () => router.navigate("/study"); setLeavingArea(true); setAreaOpen(false); return; }
    // Existing sessions and unresolved completion/restoration always win, as on Home.
    if (!timer.hasOpenSession && !timer.actionBusy && !timer.isRestoring && !timer.restoreError && !(timer.isCompleted && !timer.sessionSummary)) {
      timer.setNotes(""); timer.setLinkedTaskId(null); timer.setTargetAttributeId(selectedArea.id); setupMode.choose("routine"); setupMode.chooseRoutine(null);
    }
    afterArea.current = () => { timer.reviewSummary?.(); router.navigate("/session"); };
    setLeavingArea(true); setAreaOpen(false);
  };
  const open = () => {
    if (sheetClosing.current) return;
    setName(profile.username);
    setAvatar(profile.avatar);
    setSaveError("");
    setDiscard(false);
    setSheetOpen(true);
  };
  const dirty = name.trim() !== profile.username || avatar !== profile.avatar;
  const close = () => {
    if (lock.current) return;
    if (dirty) setDiscard(true);
    else {
      Keyboard.dismiss();
      sheetClosing.current = true;
      setSheetOpen(false);
    }
  };
  const save = async () => {
    if (lock.current || !online || currentSaveView.current !== saveView) return;
    const nameError = profileNameError(name);
    if (nameError) {
      setSaveError(nameError);
      return;
    }
    lock.current = true;
    setSaving(true);
    setSaveError("");
    try {
      await updateProfile(name.trim(), avatar);
      if (currentSaveView.current !== saveView) return;
      Keyboard.dismiss();
      sheetClosing.current = true;
      setSheetOpen(false);
    } catch (cause) {
      // Names are unique: someone else may already use this one.
      if (currentSaveView.current === saveView) setSaveError((cause as { code?: string })?.code === "23505" ? PROFILE_NAME_TAKEN
        : "Couldn’t save your changes. Your draft is here. Please try again.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  const chooseLook = useCallback((next: string) => { Keyboard.dismiss(); setAvatar(next); setSaveError(""); }, []);
  const tier = levelTierProgress(profile.level, profile.current_xp).current;
  const savedLook = characterLook(profile.avatar), draftLook = characterLook(avatar || profile.avatar);
  return (
    <PersonalPage title="Profile" subtitle="" compact back animateTransition expandFromIcon fallback="/">
      <ContentReveal><View style={s.stack}>
        {/* Your character sheet: the companion leads, then your name, level and XP. */}
        <View style={s.hero} testID="profile-companion-card">
          <Pressable onPress={() => setTiersOpen(true)} accessibilityRole="button" accessibilityLabel={`Level ${profile.level}, ${tier.title}. ${profile.current_xp} of ${required} XP. View level tiers`} style={s.portrait}>
            <View style={s.halo} pointerEvents="none" />
            <ProgressRing size={136} stroke={5} progress={profile.current_xp / required} color={colors.level} track={colors.levelSoft}>
              <View style={s.glow}><CharacterPortrait avatar={profile.avatar} size={96} level={profile.level} developed={areas.filter(area => area.level > 1 || area.current_xp > 0).length} animate={!sheetOpen && !tiersOpen && !areaOpen && !badgesOpen} greetOnFocus /></View>
            </ProgressRing>
            <View style={s.levelBadge}><Text style={s.levelBadgeText}>Level {profile.level}</Text></View>
          </Pressable>
          <View style={s.identity}>
            <Text style={s.username} numberOfLines={2}>{profile.username}</Text>
            <Text style={s.tier} numberOfLines={1}>{tier.title} · {savedLook.title}</Text>
          </View>
          <View style={s.xp}>
            <View style={s.xpHead}><Text style={s.xpValue}>{profile.current_xp} / {required} XP</Text><Text style={p.caption} numberOfLines={1}>{required - profile.current_xp} to level {profile.level + 1}</Text></View>
            <Meter value={profile.current_xp / required} height={6} color={colors.level} />
          </View>
          <View style={s.heroActions}>
            <Pressable onPress={open} accessibilityRole="button" accessibilityLabel="Personalise profile" style={s.heroButton}><Ionicons name="color-palette-outline" size={17} color={colors.accent} /><Text style={s.heroButtonText}>Personalise</Text></Pressable>
            <Pressable onPress={() => setTiersOpen(true)} accessibilityRole="button" accessibilityLabel="Level journey" style={[s.heroButton, s.heroPrimary]}><Ionicons name="sparkles-outline" size={17} color={colors.primaryText} /><Text style={[s.heroButtonText, s.heroPrimaryText]}>Level journey</Text></Pressable>
          </View>
        </View>
        {/* Three numbers side by side, read at a glance. */}
        <View style={s.statsRow} testID="profile-stats">
          {[["time-outline", "Time focused", studyTime(milestones.totals.seconds), "#64D2FF"],
            ["calendar-outline", "Focus days", String(milestones.totals.days), colors.accent],
            ["flame", "Best streak", `${milestones.totals.bestStreak} ${milestones.totals.bestStreak === 1 ? "day" : "days"}`, colors.streak]].map(([icon, label, value, tint]) =>
            <View key={label} style={s.statTile} accessible accessibilityLabel={`${label}, ${milestones.ready ? value : "loading"}`}>
              <View style={[s.statIcon, { backgroundColor: areaTint(tint) }]}><Ionicons name={icon as never} size={16} color={tint} /></View>
              <Text style={[s.statValue, label === "Best streak" && { color: colors.streak }]} numberOfLines={1} adjustsFontSizeToFit>{milestones.ready ? value : "—"}</Text>
              <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
            </View>)}
        </View>
        <View style={s.section} testID="profile-badges">
          <SectionHeader title="My Badges" subtitle={milestones.ready ? `${milestones.earned.length} of ${milestones.totals.milestones.length} earned` : "Getting your badges…"}
            onPress={() => setBadgesOpen(true)} pressLabel="My Badges. See all milestones" />
          {milestones.earned.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.badges}>
            {milestones.earned.map(badge => <Pressable key={badge.id} onPress={() => setBadgesOpen(true)} accessibilityRole="button" accessibilityLabel={`${badge.title}, earned`} style={s.badge}>
              <View style={s.badgeIcon}><Ionicons name={badge.icon as never} size={22} color={colors.level} /></View>
              <Text style={s.badgeText} numberOfLines={2}>{badge.title}</Text>
            </Pressable>)}
          </ScrollView> : <Pressable onPress={() => setBadgesOpen(true)} accessibilityRole="button" accessibilityLabel="See all milestones" style={s.emptyBadges}>
            <View style={s.badgeIcon}><Ionicons name="ribbon-outline" size={22} color={colors.level} /></View>
            <View style={s.detail}><Text style={p.rowTitle}>Your first badge is one session away</Text><Text style={p.caption}>{milestones.next ? milestones.next.description : "Every completed session counts."}</Text></View>
          </Pressable>}
        </View>
        {error && <View style={p.card}><Text style={p.error}>Couldn’t refresh your growth. {data ? "Your last loaded progress is still here." : "Check your connection and try again."}</Text><PersonalButton title="Retry" secondary onPress={() => void refresh()} /></View>}
        <View style={s.areasCard}>
          <SectionHeader title="My Categories" />
          {loading && !data && <Text style={p.body}>Loading your growth…</Text>}
          {/* Two small tiles a row: short to scroll, every category at a glance. */}
          {!!areas.length && <View style={s.areaGrid}>{areas.map(area => <Pressable key={area.id} accessibilityRole="button" accessibilityLabel={focusAreaTitle(area.title) + ", level " + area.level + ", " + area.current + " of " + area.required + " XP to the next level. View details"} onPress={() => { setAreaId(area.id); setAreaOpen(true); }} style={s.areaTile}>
            <View style={s.areaHead}><View style={[s.tileIcon, { backgroundColor: areaTint(lifeAreaColor(area.id, area.color_code)) }]}><Ionicons name={focusAreaIcon(area.title)} size={16} color={lifeAreaColor(area.id, area.color_code)} /></View><Text style={s.tileLevel}>Lv {area.level}</Text></View>
            <Text style={p.rowTitle} numberOfLines={1}>{focusAreaTitle(area.title)}</Text>
            <Meter value={area.current / area.required} color={lifeAreaColor(area.id, area.color_code)} height={5} />
          </Pressable>)}</View>}
          {data && !areas.length && <Text style={p.body}>Your overall level still grows. Categories will appear here when available.</Text>}
        </View>
        {study.courses.length > 0 && <View style={s.areasCard} testID="profile-subjects">
          <SectionHeader title="My Subjects" subtitle="All the time you’ve given each one." />
          <View style={s.subjects}>{study.courses.map((course, index) => {
            const exam = upcomingExams(study.exams).find(item => item.courseId === course.id);
            return <View key={course.id} accessible
              accessibilityLabel={`${course.name}, ${studyTime(course.totalSeconds)} in total${exam ? `, ${exam.title} ${countdownLabel(daysUntil(exam.examDate))}` : ""}`} style={[s.subjectRow, index > 0 && s.subjectLine]}>
              <View style={[s.subjectDot, { backgroundColor: courseColor(course.id) }]} />
              <View style={s.detail}><Text style={p.rowTitle} numberOfLines={1}>{course.name}</Text>
                {exam && <Text style={s.history} numberOfLines={1}>{exam.title} · {countdownLabel(daysUntil(exam.examDate))}</Text>}</View>
              <Text style={s.subjectTime}>{studyTime(course.totalSeconds)}</Text>
            </View>;
          })}</View>
        </View>}
      </View></ContentReveal>
      <FocusAreaDetailSheet visible={areaOpen} area={selectedArea && { ...selectedArea, color: lifeAreaColor(selectedArea.id, selectedArea.color_code) }} detail={areaDetail}
        timeZone={profile.timezone} sessionOpen={timer.hasOpenSession} onFocus={focusArea} onClose={() => setAreaOpen(false)} leaving={leavingArea}
        focusLabel={selectedKind === "revision" ? "Open Study" : undefined}
        extra={recentAreaSessions.length ? <SubjectBreakdown owner={profile.id} sessions={recentAreaSessions} /> : null}
        onDismiss={() => { const next = afterArea.current; afterArea.current = null; setLeavingArea(false); next?.(); }} />
      <MilestonesSheet visible={badgesOpen} onClose={() => setBadgesOpen(false)} />
      <LevelTierSheet visible={tiersOpen} level={profile.level} currentXP={profile.current_xp} onClose={() => setTiersOpen(false)} />
      <AppSheet visible={sheetOpen} onRequestClose={close} onDismiss={() => { sheetClosing.current = false; }} guardDismiss={dirty || saving || discard}
        expanded motionMode="timed" keyboardBehavior="fillParent" label="Personalise profile"
        header={<View style={p.sheetHeader}><Text style={p.title}>Make it yours</Text><Text style={p.body}>Your name and your companion’s look.</Text></View>}
        footer={<View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(16, insets.bottom), backgroundColor: colors.surfaceRaised }}>{!online && <Text testID="profile-save-needs-internet" accessibilityLiveRegion="polite" style={p.caption}>Needs internet</Text>}<PersonalButton title={saving ? "Saving…" : "Save changes"} disabled={saving || !online} accessibilityLabel={online ? "Save changes" : "Save changes. Needs internet"} onPress={() => void save()} /></View>}
        overlay={discard ? <SheetConfirmation title="Discard changes?" message="Your changes haven’t been saved." confirmLabel="Discard changes" cancelLabel="Keep editing"
          onCancel={() => setDiscard(false)} onConfirm={() => { setDiscard(false); Keyboard.dismiss(); sheetClosing.current = true; setSheetOpen(false); }} /> : undefined}>
        <BottomSheetScrollView ref={nameScroll} keyboardShouldPersistTaps="handled" enableFooterMarginAdjustment contentContainerStyle={[p.sheetBody, { paddingBottom: 16 }]}>
          <Text style={p.rowTitle}>Name</Text>
          <SheetTextInput accessibilityLabel="Profile name" editable={!saving} style={p.input} maxLength={PROFILE_NAME_LIMIT} autoCapitalize="words" autoComplete="name" returnKeyType="done"
            onFocus={() => nameScroll.current?.scrollTo({ y: 0, animated: false })} value={name} onChangeText={value => { setName(value); setSaveError(""); }} />
          <Text style={p.caption}>Up to {PROFILE_NAME_LIMIT} characters, including spaces.</Text>
          {!!saveError && <Text style={p.error} accessibilityRole="alert">{saveError}</Text>}
          <View style={s.preview} testID="profile-look-preview"><CharacterPortrait avatar={avatar || profile.avatar} size={116} animate={sheetOpen && !saving} interactive={false} /><View style={s.detail}><Text style={p.rowTitle}>{draftLook.title}</Text><Text style={p.caption}>{draftLook.detail}</Text><Text style={s.growthHint}>Choose a look that feels like you.</Text></View></View>
          <Text style={p.rowTitle}>Character look</Text>
          <CharacterLookPicker value={avatar} disabled={saving} onChange={chooseLook} />
        </BottomSheetScrollView>
      </AppSheet>
    </PersonalPage>
  );
}
const s = StyleSheet.create({
  stack: { gap: 24 }, section: { gap: 10 },
  hero: { ...edge, alignItems: "center", gap: 14, paddingHorizontal: 18, paddingTop: 24, paddingBottom: 18, borderRadius: radius.card, backgroundColor: colors.surface },
  portrait: { alignItems: "center", justifyContent: "center" },
  // A soft warm halo behind the ring, so the level frame looks earned.
  halo: { position: "absolute", top: -12, width: 160, height: 160, borderRadius: 80, backgroundColor: "rgba(251,191,36,0.07)" },
  levelBadge: { marginTop: -14, paddingHorizontal: 12, minHeight: 28, borderRadius: 14, justifyContent: "center", backgroundColor: colors.level, borderWidth: 3, borderColor: colors.surface },
  levelBadgeText: { color: "#2B2200", fontSize: 14, fontWeight: "800" },
  tier: { color: colors.level, fontSize: 15, lineHeight: 20, fontWeight: "600", textAlign: "center" },
  xp: { alignSelf: "stretch", gap: 8, padding: 12, borderRadius: radius.row, backgroundColor: colors.surfaceRaised },
  xpHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  xpValue: { color: colors.level, fontSize: 15, lineHeight: 20, fontWeight: "700", fontVariant: ["tabular-nums"] },
  heroActions: { alignSelf: "stretch", flexDirection: "row", gap: 10 },
  heroButton: { ...edge, flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 24, backgroundColor: colors.surfaceRaised },
  heroButtonText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  heroPrimary: { backgroundColor: colors.primary, borderColor: colors.primary }, heroPrimaryText: { color: colors.primaryText },
  statsRow: { flexDirection: "row", gap: 10 },
  statTile: { ...edge, flex: 1, minHeight: 108, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 14, borderRadius: radius.tile, backgroundColor: colors.surface },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statLabel: { color: colors.secondary, fontSize: 13, lineHeight: 17, textAlign: "center" },
  statValue: { color: colors.text, fontSize: 19, lineHeight: 24, fontWeight: "700", fontVariant: ["tabular-nums"], textAlign: "center" },
  badges: { gap: 10, paddingRight: 8 },
  badge: { ...edge, width: 112, minHeight: 108, padding: 12, gap: 8, borderRadius: radius.tile, backgroundColor: colors.surface },
  badgeIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.levelSoft },
  badgeText: { color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: "600" },
  emptyBadges: { ...edge, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.card, backgroundColor: colors.surface },
  glow: { width: 116, height: 116, borderRadius: 58, alignItems: "center", justifyContent: "center", backgroundColor: colors.levelSoft }, identity: { alignItems: "center", gap: 4 },
  username: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: "700", letterSpacing: -0.5, textAlign: "center" },
  growthHint: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  detail: { flex: 1, minWidth: 0, gap: 4 }, history: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  areasCard: { gap: 12, paddingHorizontal: 2 },
  areaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  areaTile: { ...edge, flexBasis: "48%", flexGrow: 1, padding: 12, gap: 8, borderRadius: 18, backgroundColor: colors.surface },
  areaHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  tileLevel: { color: colors.secondary, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  tileIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  subjects: { ...edge, borderRadius: radius.card, backgroundColor: colors.surface, overflow: "hidden" },
  subjectRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  subjectLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  subjectDot: { width: 10, height: 10, borderRadius: 5 },
  subjectTime: { color: colors.secondary, fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
  preview: { flexDirection: "row", alignItems: "center", minHeight: 132, gap: 14, paddingVertical: 4 },
});
