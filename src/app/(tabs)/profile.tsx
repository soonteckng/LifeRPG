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
import AppSheet from "../../components/AppSheet";
import SheetConfirmation from "../../components/SheetConfirmation";
import CharacterPortrait from "../../components/CharacterPortrait";
import {
  Meter,
  PersonalButton,
  PersonalPage,
  p,
} from "../../components/PersonalUI";
import { colors } from "../../constants/theme";
import { useUser } from "../../context/UserContext";
import { useCharacterData } from "../../hooks/useCharacterData";
import { earnedMilestones, lifeAreaGrowth } from "../../utils/characterGrowth";
import { durationLabel } from "../../utils/progressAnalytics";

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
  const nameScroll = useRef<BottomSheetScrollViewMethods>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const sheetClosing = useRef(false);
  const [saveError, setSaveError] = useState("");
  const [discard, setDiscard] = useState(false);
  useFocusEffect(
    useCallback(() => {
      void reloadProfile();
    }, [reloadProfile]),
  );
  const areas = (data?.areas ?? []).map(lifeAreaGrowth);
  const totals = useMemo(() => earnedMilestones(data?.sessions ?? [], profile.timezone), [data, profile.timezone]);
  const required = Math.floor(100 * Math.pow(Math.max(1, profile.level), 1.5));
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
          <CharacterPortrait avatar={profile.avatar} size={170} level={profile.level} developed={areas.filter(area => area.level > 1 || area.current_xp > 0).length} animate={!sheetOpen} />
          <View style={s.identity}><Text style={s.username} numberOfLines={2}>{profile.username}</Text><Text style={p.caption}>{savedLook.title} · Your companion</Text></View>
          <View style={s.levelBlock}><View style={s.levelRow}><View style={s.levelPill}><Ionicons name="sparkles-outline" size={14} color={colors.accent} /><Text style={s.levelText}>Level {profile.level}</Text></View><Text style={p.caption}>{profile.current_xp} / {required} XP</Text></View><Meter value={profile.current_xp / required} /><Text style={s.growthHint}>Your next level grows with completed focus.</Text></View>
          <PersonalButton title="Personalise" accessibilityLabel="Personalise profile" secondary onPress={open} />
        </View>
        {error && <View style={p.card}><Text style={p.error}>Couldn’t refresh your growth. {data ? "Your last loaded progress is still here." : "Check your connection and try again."}</Text><PersonalButton title="Retry" secondary onPress={() => void refresh()} /></View>}
        <Pressable testID="profile-milestones-entry" onPress={() => router.navigate("/rewards")} accessibilityRole="button" accessibilityLabel="View your milestone collection" style={s.milestones}>
          <View style={p.icon}><Ionicons name="ribbon-outline" size={23} color={colors.accent} /></View>
          <View style={s.detail}><Text style={p.rowTitle}>Your milestones</Text><Text style={p.caption}>{data ? totals.milestones.filter(m => m.unlocked).length + " of " + totals.milestones.length + " earned" : "Your collection of small beginnings"}</Text>{data && <Text style={s.history}>{durationLabel(totals.seconds)} · {totals.sessions} sessions</Text>}</View>
          <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
        </Pressable>
        <View style={s.areasCard}>
          <View style={s.areaHeading}><Text style={s.sectionTitle}>Your focus areas</Text><Text style={p.caption}>Where you make time for what matters.</Text></View>
          {loading && !data && <Text style={p.body}>Loading your growth…</Text>}
          {areas.map(area => <View key={area.id} accessible accessibilityLabel={focusAreaTitle(area.title) + ", level " + area.level + ", " + area.current + " of " + area.required + " XP to the next level"} style={s.areaRow}>
            <View style={p.inline}><Ionicons name={focusAreaIcon(area.title)} size={18} color={lifeAreaColor(area.id, area.color_code)} /><Text style={[p.rowTitle, p.flex]}>{focusAreaTitle(area.title)}</Text><Text style={s.areaLevel}>Lv {area.level}</Text></View><Meter value={area.current / area.required} color={lifeAreaColor(area.id, area.color_code)} />
          </View>)}
          {data && !areas.length && <Text style={p.body}>Your overall level still grows. Focus areas will appear here when available.</Text>}
          <Text style={s.growthHint}>Levels reflect the effort you’ve recorded.</Text>
        </View>
      </View></ContentReveal>
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
  stack: { gap: 18 }, hero: { padding: 18, gap: 14, borderRadius: 26, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  identity: { alignItems: "center", gap: 5 }, username: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: "500", letterSpacing: -0.4, textAlign: "center" },
  levelBlock: { gap: 8 }, levelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, levelPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 10, backgroundColor: colors.accentSoft }, levelText: { color: colors.accent, fontSize: 13, lineHeight: 18, fontWeight: "500" }, growthHint: { color: colors.secondary, fontSize: 13, lineHeight: 19 },
  milestones: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 22, backgroundColor: colors.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, detail: { flex: 1, minWidth: 0, gap: 4 }, history: { color: colors.secondary, fontSize: 13, lineHeight: 19 },
  areasCard: { padding: 18, gap: 12, backgroundColor: colors.surface, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line }, areaHeading: { gap: 5, paddingBottom: 4 }, sectionTitle: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: "500" }, areaRow: { minHeight: 50, paddingVertical: 5, gap: 7 }, areaLevel: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  preview: { flexDirection: "row", alignItems: "center", minHeight: 132, gap: 14, paddingVertical: 4 },
});
