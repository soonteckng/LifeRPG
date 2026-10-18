import { focusAreaTitle, focusAreaIcon } from "../../utils/focusAreas";
import { PROFILE_NAME_LIMIT, profileNameError } from "../../constants/profile";
import { rememberSettingsOrigin } from "../../utils/settingsOrigin";
import Pressable from "../../components/MotionPressable";
import { useTimer } from "../../context/TimerContext";
import { floatingTabInset } from "../../utils/floatingTabInset";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { Text } from "../../components/AppText";
import ContentReveal from "../../components/ContentReveal";
import { lifeAreaColor } from "../../utils/lifeAreaColor";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetScrollView,
  type BottomSheetScrollViewMethods,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Keyboard, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { requiredCharacterXP } from "../../utils/levelTiers";
import LevelTierSheet from "../../components/LevelTierSheet";
import FocusAreaDetailSheet from "../../components/FocusAreaDetailSheet";
import { focusAreaDetail } from "../../utils/focusAreaDetail";
import AppSheet from "../../components/AppSheet";
import SheetConfirmation from "../../components/SheetConfirmation";
import CharacterPortrait from "../../components/CharacterPortrait";
import {
  Meter,
  PersonalButton,
  PersonalPage,
  p,
} from "../../components/PersonalUI";
import { colors, radius } from "../../constants/theme";
import { useUser } from "../../context/UserContext";
import { useCharacterData } from "../../hooks/useCharacterData";
import { earnedMilestones, profileFocusAreaGrowth } from "../../utils/characterGrowth";
import { durationLabel } from "../../utils/progressAnalytics";
import { useStudyPlan } from "../../hooks/useStudyPlan";
import { setupMode } from "../../services/setupMode";
import { countdownLabel, courseColor, daysUntil, studyTime, upcomingExams } from "../../utils/studyPlan";

import CharacterLookPicker from "../../components/CharacterLookPicker";
import { characterLook } from "../../utils/characterAppearance";
export default function ProfileScreen() {
  const router = useRouter();
  const settingsIcon = useRef<View>(null);
  const openSettings = () => {
    let opened = false;
    const open = () => { if (!opened) { opened = true; router.navigate("/settings"); } };
    const fallback = setTimeout(open, 100);
    settingsIcon.current?.measureInWindow((x, y, width, height) => { if (opened) return; clearTimeout(fallback); rememberSettingsOrigin({ x, y, width, height }); open(); });
  };
  const insets = useSafeAreaInsets();
  const timer = useTimer();
  const tabBarHeight = floatingTabInset(useBottomTabBarHeight(), insets.bottom, timer);
  const { profile, updateProfile, reloadProfile } = useUser();
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
  const totals = useMemo(() => earnedMilestones(data?.sessions ?? [], profile.timezone), [data, profile.timezone]);
  const required = requiredCharacterXP(profile.level);
  const selectedArea = areas.find(area => area.id === areaId) ?? null;
  const areaDetail = selectedArea && data ? focusAreaDetail(selectedArea, data.areas, data.sessions, profile.timezone) : null;
  const focusArea = () => {
    if (!selectedArea) return;
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
    if (lock.current) return;
    const nameError = profileNameError(name);
    if (nameError) {
      setSaveError(nameError);
      return;
    }
    lock.current = true;
    setSaving(true);
    setSaveError("");
    try {
      await updateProfile(name.trim(), avatar, profile.class_title);
      Keyboard.dismiss();
      sheetClosing.current = true;
      setSheetOpen(false);
    } catch {
      setSaveError(
        "Couldn’t save your changes. Your draft is here. Please try again.",
      );
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  const chooseLook = useCallback((next: string) => { Keyboard.dismiss(); setAvatar(next); setSaveError(""); }, []);
  const savedLook = characterLook(profile.avatar), draftLook = characterLook(avatar || profile.avatar);
  return (
    <PersonalPage bottomContentInset={tabBarHeight} title="Profile" subtitle="" compact
      action={<View ref={settingsIcon} collapsable={false}><Pressable accessibilityRole="button" accessibilityLabel="Open Settings" onPress={openSettings} style={p.back}><Ionicons name="settings-outline" size={23} color={colors.accent} /></Pressable></View>}>
      <ContentReveal><View style={s.stack}>
        <View style={s.hero} testID="profile-companion-card">
          <View style={s.heroHead}><View style={s.glow}><CharacterPortrait avatar={profile.avatar} size={112} level={profile.level} developed={areas.filter(area => area.level > 1 || area.current_xp > 0).length} animate={!sheetOpen && !tiersOpen && !areaOpen} greetOnFocus /></View>
          <View style={s.identity}><Text style={s.companionLabel}>YOUR COMPANION</Text><Text style={s.username} numberOfLines={2}>{profile.username}</Text><Text style={[p.caption, s.centerText]}>{savedLook.title}</Text></View></View>
          <View style={s.levelBlock}><View style={s.levelRow}><Pressable style={s.levelPill} onPress={() => setTiersOpen(true)} accessibilityRole="button" accessibilityLabel={`Level ${profile.level}. View level tiers`}><Ionicons name="sparkles" size={14} color={colors.level} /><Text style={s.levelText}>Level {profile.level}</Text><Ionicons name="chevron-forward" size={12} color={colors.level} /></Pressable><Text style={p.caption}>{profile.current_xp} / {required} XP</Text></View><Meter value={profile.current_xp / required} height={8} color={colors.level} /><Text style={s.growthHint}>Your next level grows with the effort you record.</Text></View>
          <Pressable onPress={open} accessibilityRole="button" accessibilityLabel="Personalise profile" style={s.personalise}><Ionicons name="color-palette-outline" size={17} color={colors.accent} /><Text style={s.personaliseText}>Personalise</Text></Pressable>
        </View>
        {error && <View style={p.card}><Text style={p.error}>Couldn’t refresh your growth. {data ? "Your last loaded progress is still here." : "Check your connection and try again."}</Text><PersonalButton title="Retry" secondary onPress={() => void refresh()} /></View>}
        <Pressable testID="profile-milestones-entry" onPress={() => router.navigate("/rewards")} accessibilityRole="button" accessibilityLabel="View your milestone collection" style={s.milestones}>
          <View style={p.icon}><Ionicons name="ribbon-outline" size={23} color={colors.accent} /></View>
          <View style={s.detail}><Text style={p.rowTitle}>Your milestones</Text><Text style={p.caption}>{data ? totals.milestones.filter(m => m.unlocked).length + " of " + totals.milestones.length + " earned" : "Your collection of small beginnings"}</Text>{data && <Text style={s.history}>{durationLabel(totals.seconds)} · {totals.sessions} sessions</Text>}</View>
          <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
        </Pressable>
        <View style={s.areasCard}>
          <View style={s.areaHeading}><Text style={s.sectionTitle}>Your categories</Text><Text style={p.caption}>Where you make time for what matters.</Text></View>
          {loading && !data && <Text style={p.body}>Loading your growth…</Text>}
          <View style={s.areaGrid}>{areas.map(area => <Pressable key={area.id} accessibilityRole="button" accessibilityLabel={focusAreaTitle(area.title) + ", level " + area.level + ", " + area.current + " of " + area.required + " XP to the next level. View details"} onPress={() => { setAreaId(area.id); setAreaOpen(true); }} style={s.areaRow}>
            <View style={s.tileIcon}><Ionicons name={focusAreaIcon(area.title)} size={19} color={lifeAreaColor(area.id, area.color_code)} /></View>
            <Text style={p.rowTitle} numberOfLines={2}>{focusAreaTitle(area.title)}</Text><Text style={s.tileLevel}>Lv {area.level}</Text><Meter value={area.current / area.required} color={lifeAreaColor(area.id, area.color_code)} height={6} />
          </Pressable>)}</View>
          {data && !areas.length && <Text style={p.body}>Your overall level still grows. Categories will appear here when available.</Text>}
          <Text style={s.growthHint}>Levels reflect the effort you’ve recorded.</Text>
        </View>
        {study.courses.length > 0 && <View style={s.areasCard} testID="profile-subjects">
          <View style={s.areaHeading}><Text style={s.sectionTitle}>Your subjects</Text><Text style={p.caption}>All the time you’ve given each one.</Text></View>
          <View style={s.subjects}>{study.courses.map((course, index) => {
            const exam = upcomingExams(study.exams).find(item => item.courseId === course.id);
            return <Pressable key={course.id} onPress={() => router.navigate("/study")} accessibilityRole="button"
              accessibilityLabel={`${course.name}, ${studyTime(course.totalSeconds)} in total${exam ? `, ${exam.title} ${countdownLabel(daysUntil(exam.examDate))}` : ""}. Open Study`} style={[s.subjectRow, index > 0 && s.subjectLine]}>
              <View style={[s.subjectDot, { backgroundColor: courseColor(course.id) }]} />
              <View style={s.detail}><Text style={p.rowTitle} numberOfLines={1}>{course.name}</Text>
                {exam && <Text style={s.history} numberOfLines={1}>{exam.title} · {countdownLabel(daysUntil(exam.examDate))}</Text>}</View>
              <Text style={s.subjectTime}>{studyTime(course.totalSeconds)}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.secondary} />
            </Pressable>;
          })}</View>
        </View>}
      </View></ContentReveal>
      <FocusAreaDetailSheet visible={areaOpen} area={selectedArea && { ...selectedArea, color: lifeAreaColor(selectedArea.id, selectedArea.color_code) }} detail={areaDetail}
        timeZone={profile.timezone} sessionOpen={timer.hasOpenSession} onFocus={focusArea} onClose={() => setAreaOpen(false)} leaving={leavingArea}
        onDismiss={() => { const next = afterArea.current; afterArea.current = null; setLeavingArea(false); next?.(); }} />
      <LevelTierSheet visible={tiersOpen} level={profile.level} currentXP={profile.current_xp} onClose={() => setTiersOpen(false)} />
      <AppSheet visible={sheetOpen} onRequestClose={close} onDismiss={() => { sheetClosing.current = false; }} guardDismiss={dirty || saving || discard}
        expanded motionMode="timed" keyboardBehavior="fillParent" label="Personalise profile"
        header={<View style={p.sheetHeader}><Text style={p.title}>Make it yours</Text><Text style={p.body}>Your name and your companion’s look.</Text></View>}
        footer={<View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(16, insets.bottom), backgroundColor: colors.surfaceRaised }}><PersonalButton title={saving ? "Saving…" : "Save changes"} disabled={saving} onPress={() => void save()} /></View>}
        overlay={discard ? <SheetConfirmation title="Discard changes?" message="Your changes haven’t been saved." confirmLabel="Discard changes" cancelLabel="Keep editing"
          onCancel={() => setDiscard(false)} onConfirm={() => { setDiscard(false); Keyboard.dismiss(); sheetClosing.current = true; setSheetOpen(false); }} /> : undefined}>
        <BottomSheetScrollView ref={nameScroll} keyboardShouldPersistTaps="handled" enableFooterMarginAdjustment contentContainerStyle={[p.sheetBody, { paddingBottom: 16 }]}>
          <Text style={p.rowTitle}>Name</Text>
          <BottomSheetTextInput accessibilityLabel="Profile name" editable={!saving} style={p.input} maxLength={PROFILE_NAME_LIMIT} autoCapitalize="words" autoComplete="name" returnKeyType="done"
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
  stack: { gap: 24 }, hero: { padding: 18, gap: 16, borderRadius: radius.card, backgroundColor: colors.focusSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.focusBorder },
  heroHead: { alignItems: "center", gap: 10 }, personalise: { alignSelf: "center", minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, borderRadius: 22, backgroundColor: colors.accentSoft }, personaliseText: { color: colors.accent, fontSize: 15, lineHeight: 20, fontWeight: "600" }, glow: { width: 136, height: 136, borderRadius: 68, alignItems: "center", justifyContent: "center", backgroundColor: colors.levelSoft }, centerText: { textAlign: "center" }, identity: { alignItems: "center", gap: 5 }, companionLabel: { color: colors.secondary, fontSize: 12, lineHeight: 16, fontWeight: "500", letterSpacing: 1.4, textAlign: "center" }, username: { color: colors.text, fontSize: 30, lineHeight: 36, textAlign: "center", fontWeight: "600", letterSpacing: -0.4 },
  levelBlock: { gap: 8 }, levelRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }, levelPill: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5, paddingHorizontal: 14, borderRadius: 22, backgroundColor: colors.levelSoft }, levelText: { color: colors.level, fontSize: 14, lineHeight: 20, fontWeight: "600" }, growthHint: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  milestones: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, detail: { flex: 1, minWidth: 0, gap: 4 }, history: { color: colors.secondary, fontSize: 13, lineHeight: 18 },
  areasCard: { gap: 12, paddingHorizontal: 2 }, areaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, tileLevel: { position: "absolute", top: 14, right: 14, color: colors.secondary, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] }, tileIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" }, areaHeading: { gap: 5, paddingBottom: 8 }, sectionTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "600", letterSpacing: -0.3 }, areaRow: { flexGrow: 1, flexBasis: "46%", minWidth: 140, padding: 14, gap: 10, borderRadius: radius.tile, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, areaLevel: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  subjects: { borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, overflow: "hidden" },
  subjectRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  subjectLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  subjectDot: { width: 10, height: 10, borderRadius: 5 },
  subjectTime: { color: colors.secondary, fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
  preview: { flexDirection: "row", alignItems: "center", minHeight: 132, gap: 14, paddingVertical: 4 },
});
