import { useTimer } from "../../context/TimerContext";
import { floatingTabInset } from "../../utils/floatingTabInset";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { Text } from "../../components/AppText";
import ContentReveal from "../../components/ContentReveal";
import { lifeAreaColor } from "../../utils/lifeAreaColor";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetScrollView,
  BottomSheetTextInput,
  TouchableOpacity as SheetButton,
} from "@gorhom/bottom-sheet";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";
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
  const insets = useSafeAreaInsets();
  const timer = useTimer();
  const tabBarHeight = floatingTabInset(useBottomTabBarHeight(), insets.bottom, timer);
  const { profile, updateProfile, reloadProfile } = useUser();
  const { data, loading, error, refresh } = useCharacterData();
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
    if (!name.trim() || name.trim().length > 40) {
      setSaveError("Enter a name between 1 and 40 characters.");
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Settings"
          onPress={() => router.navigate("/settings")}
          style={p.back}
        >
          <Ionicons name="settings-outline" size={23} color={colors.accent} />
        </Pressable>
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
          {!!profile.class_title && <Text style={p.caption}>{profile.class_title}</Text>}
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
        <Text style={p.sectionLabel}>Your Life areas</Text>

        {areas.map((area) => (
          <View key={area.id} accessible accessibilityLabel={`${area.title}, level ${area.level}, ${area.current} of ${area.required} XP to the next level`} style={{ gap: 6, minHeight:52, paddingVertical: 8 }}>
            <View style={p.inline}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: lifeAreaColor(area.id, area.color_code) }} />
              <Text style={[p.rowTitle, p.flex]}>{area.title}</Text>
              <Text style={p.rowTitle}>Lv {area.level}</Text>
            </View>
            <Meter value={area.current / area.required} color={lifeAreaColor(area.id, area.color_code)} />

          </View>
        ))}
        {data && areas.length === 0 && (
          <Text style={p.body}>
            Your overall level still grows. Life areas will appear here when
            available.
          </Text>
        )}

      </View>
      <View style={{ gap: 12 }}>
        <View style={p.inline}><Text style={[p.sectionLabel, p.flex]}>Milestones</Text>
          <Pressable onPress={() => router.navigate("/rewards")} accessibilityRole="button" accessibilityLabel="View milestones" style={{ minHeight: 44, justifyContent: "center" }}>
            <Text style={{ color: colors.accent, fontSize: 13 }}>View all →</Text>
          </Pressable>
        </View>

        <View style={[p.inline, { flexWrap: "wrap", gap: 10 }]}>
          {totals.milestones.map(m => <Pressable key={m.id} onPress={() => router.navigate("/rewards")}
            accessibilityRole="button" accessibilityLabel={`${m.title}, ${m.unlocked ? "earned" : "in progress"}. View milestones`}
            style={{ width: 40, height: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: m.unlocked ? "rgba(56,201,179,0.3)" : colors.line, backgroundColor: m.unlocked ? "rgba(56,201,179,0.1)" : colors.surface, justifyContent: "center", alignItems: "center" }}>
            <Ionicons name={m.unlocked ? m.icon as import("../../components/PersonalUI").PersonalIcon : "lock-closed-outline"} size={22} color={m.unlocked ? "#38C9B3" : colors.muted} />
          </Pressable>)}
        </View>
        {data && <Text style={[p.caption, { paddingTop: 12 }]}>{durationLabel(totals.seconds)} across {totals.sessions} sessions · {totals.days} focus days</Text>}
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
          keyboardShouldPersistTaps="handled"
          enableFooterMarginAdjustment
          contentContainerStyle={[p.sheetBody, { paddingBottom: 12 }]}
        >
          <Text style={p.rowTitle}>Name</Text>
          <BottomSheetTextInput
            accessibilityLabel="Profile name"
            editable={!saving}
            style={p.input}
            maxLength={40}
            value={name}
            onChangeText={setName}
          />
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
          {!!saveError && (
            <Text style={p.error} accessibilityRole="alert">
              {saveError}
            </Text>
          )}
        </BottomSheetScrollView>
      </AppSheet>
    </PersonalPage>
  );
}

