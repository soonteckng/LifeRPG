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
  TouchableOpacity as SheetButton,
} from "@gorhom/bottom-sheet";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
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

import { CHARACTER_BADGES } from "../../constants/characterBadges";
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
  const totals = earnedMilestones(data?.sessions ?? [], profile.timezone);
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
        "Couldn’t save your changes. Your draft is here—please try again.",
      );
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  return (
    <PersonalPage
      bottomContentInset={tabBarHeight}
      title="Profile"
      subtitle=""
      compact floatingAction
      action={
        <View style={p.inline}>
        <Pressable accessibilityRole="button" accessibilityLabel="Personalise profile" onPress={open} style={p.back}><Ionicons name="create-outline" size={22} color={colors.accent} /></Pressable>
        <View ref={settingsIcon} collapsable={false}><Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Settings"
          onPress={openSettings}
          style={p.back}
        >
          <Ionicons name="settings-outline" size={23} color={colors.accent} />
        </Pressable></View>
        </View>
      }
    >
      <ContentReveal><View style={{ gap: 32 }}>
      <View style={{ gap: 8, paddingTop: 0, paddingBottom: 0 }}>
        <CharacterPortrait
          avatar={profile.avatar}
          size={144}
          level={profile.level}
          developed={
            areas.filter((area) => area.level > 1 || area.current_xp > 0).length
          }
        />

        <View style={{ alignItems: "center", gap: 6 }}>
          <Text style={[p.title, { fontSize: 28, lineHeight:34 }]}>{profile.username}</Text>
          <Text style={p.caption}>Your focus journey</Text>
          <Text style={p.body}>Level {profile.level}</Text>
        </View>

        <Text style={[p.caption, { textAlign: "center" }]}>
          {profile.current_xp} / {required} XP to level {profile.level + 1}
        </Text>
        <Text style={[p.caption,{textAlign:"center"}]}>Reflects focus, not ability.</Text>
      </View>
      {error && (
        <View style={p.card}>
          <Text style={p.error}>
            Couldn’t refresh your growth.{" "}
            {data
              ? "Your last loaded progress is still here."
              : "Check your connection and try again."}
          </Text>
          <PersonalButton
            title="Retry"
            secondary
            onPress={() => void refresh()}
          />
        </View>
      )}
      {loading && !data && <Text style={p.body}>Loading your growth…</Text>}
      <View style={{ gap: 12 }}>
        <Text style={p.sectionLabel}>Your focus areas</Text>
        <Text style={p.caption}>Where you make time: learning, wellbeing, personal care and everyday life. Levels record effort, not ability.</Text>

        {areas.map((area) => (
          <View key={area.id} accessible accessibilityLabel={`${focusAreaTitle(area.title)}, level ${area.level}, ${area.current} of ${area.required} XP to the next level`} style={{ gap: 6, minHeight:52, paddingVertical: 8 }}>
            <View style={p.inline}>
              <Ionicons name={focusAreaIcon(area.title)} size={18} color={lifeAreaColor(area.id, area.color_code)} />
              <Text style={[p.rowTitle, p.flex]}>{focusAreaTitle(area.title)}</Text>
              <Text style={p.rowTitle}>Lv {area.level}</Text>
            </View>
            <Meter value={area.current / area.required} color={lifeAreaColor(area.id, area.color_code)} />

          </View>
        ))}
        {data && areas.length === 0 && (
          <Text style={p.body}>
            Your overall level still grows. Focus areas will appear here when
            available.
          </Text>
        )}

      </View>
      <View style={{ gap: 12 }}>
        <Pressable testID="profile-milestones-entry" onPress={() => router.navigate("/rewards")}
          accessibilityRole="button" accessibilityLabel="View your milestone collection" style={[p.card, { flexDirection: "row", alignItems: "center", gap: 14 }]}>
          <View style={p.icon}><Ionicons name="ribbon-outline" size={23} color={colors.accent} /></View>
          <View style={{ flex: 1, gap: 5 }}><Text style={p.title}>Your milestones</Text>
            <Text style={p.caption}>{data ? `${totals.milestones.filter(m => m.unlocked).length} of ${totals.milestones.length} earned · A record of showing up` : loading ? "Loading your collection…" : "Explore the effort you’ve recorded"}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
        </Pressable>
        {data && <Text style={p.caption}>{durationLabel(totals.seconds)} across {totals.sessions} sessions · {totals.days} focus days</Text>}
      </View>
      </View></ContentReveal>
      <AppSheet
        visible={sheetOpen}
        onRequestClose={close}
        onDismiss={() => {
          sheetClosing.current = false;
        }}
        guardDismiss={dirty || saving || discard}
        compact
        keyboardBehavior="fillParent"
        label="Personalise profile"
        header={
          <View style={p.sheetHeader}>
            <Text style={p.title}>Make it yours</Text>
            <Text style={p.body}>Your name and character badge.</Text>
          </View>
        }
        footer={
          <View
            style={{
              paddingHorizontal: 22,
              paddingTop: 12,
              paddingBottom: Math.max(16, insets.bottom),
              backgroundColor: colors.surface,
            }}
          >
            <PersonalButton
              title={saving ? "Saving…" : "Save changes"}
              disabled={saving}
              onPress={() => void save()}
            />
          </View>
        }
        overlay={
          discard ? (
            <SheetConfirmation
              title="Discard changes?"
              message="Your changes haven’t been saved."
              confirmLabel="Discard changes"
              cancelLabel="Keep editing"
              onCancel={() => setDiscard(false)}
              onConfirm={() => {
                setDiscard(false);
                Keyboard.dismiss();
                sheetClosing.current = true;
                setSheetOpen(false);
              }}
            />
          ) : undefined
        }
      >
        <BottomSheetScrollView
          ref={nameScroll}
          keyboardShouldPersistTaps="handled"
          enableFooterMarginAdjustment
          contentContainerStyle={[p.sheetBody, { paddingBottom: 12 }]}
        >
          <Text style={p.rowTitle}>Name</Text>
          <BottomSheetTextInput
            accessibilityLabel="Profile name"
            editable={!saving}
            style={p.input}
            maxLength={PROFILE_NAME_LIMIT}
            autoCapitalize="words" autoComplete="name" returnKeyType="done"
            onFocus={() => nameScroll.current?.scrollTo({ y: 0, animated: true })}
            value={name}
            onChangeText={value => { setName(value); setSaveError(""); }}
          />
          <Text style={p.caption}>Up to {PROFILE_NAME_LIMIT} characters, including spaces.</Text>
          {!!saveError && <Text style={p.error} accessibilityRole="alert">{saveError}</Text>}
          <Text style={p.rowTitle}>Character badge</Text>
          <View style={[p.inline, { flexWrap: "wrap" }]}>
            {CHARACTER_BADGES.map((item) => (
              <SheetButton
                key={item}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={`Choose ${item}`}
                accessibilityState={{ selected: avatar === item }}
                onPress={() => setAvatar(item)}
                style={[
                  p.pill,
                  {
                    padding: 14,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor:
                      avatar === item ? colors.accent : "transparent",
                  },
                ]}
              >
                <Text style={{ fontSize: 23 }}>{item}</Text>
              </SheetButton>
            ))}
          </View>

        </BottomSheetScrollView>
      </AppSheet>
    </PersonalPage>
  );
}
