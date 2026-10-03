import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetScrollView,
  BottomSheetTextInput,
  TouchableOpacity as SheetButton,
} from "@gorhom/bottom-sheet";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Keyboard, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppSheet from "../../components/AppSheet";
import SheetConfirmation from "../../components/SheetConfirmation";
import CharacterPortrait from "../../components/CharacterPortrait";
import {
  Meter,
  PersonalButton,
  PersonalPage,
  PersonalRow,
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
      title="Profile"
      subtitle="A reflection of your effort."
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Settings"
          onPress={() => router.navigate("/settings")}
          style={p.back}
        >
          <Ionicons name="settings-outline" size={23} color={colors.accent} />
        </Pressable>
      }
    >
      <View style={p.card}>
        <View style={p.inline}>
          <Text style={[p.label, p.flex]}>YOUR CHARACTER</Text>
          <View style={p.pill}>
            <Text style={p.rowTitle}>Level {profile.level}</Text>
          </View>
        </View>
        <CharacterPortrait
          avatar={profile.avatar}
          level={profile.level}
          developed={
            areas.filter((area) => area.level > 1 || area.current_xp > 0).length
          }
        />
        <Text style={[p.caption, { textAlign: "center" }]}>
          Tap your character to say hello.
        </Text>
        <View style={{ alignItems: "center", gap: 6 }}>
          <Text style={[p.title, { fontSize: 26 }]}>{profile.username}</Text>
          <Text style={p.body}>Built one session at a time.</Text>
        </View>
        <Meter value={profile.current_xp / required} />
        <Text style={p.caption}>
          {profile.current_xp} / {required} XP to level {profile.level + 1}
        </Text>
        <PersonalButton title="Personalise profile" secondary onPress={open} />
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
      <View style={p.card}>
        <Text style={p.title}>Your growth</Text>
        <Text style={p.body}>
          Your Life areas are your character’s stats. Complete sessions in an
          area to grow its level.
        </Text>
        {areas.map((area) => (
          <View key={area.id} style={{ gap: 9, paddingVertical: 8 }}>
            <View style={p.inline}>
              <View style={p.icon}>
                <Ionicons name="leaf-outline" size={21} color={colors.accent} />
              </View>
              <Text style={[p.rowTitle, p.flex]}>{area.title}</Text>
              <Text style={p.rowTitle}>Lv {area.level}</Text>
            </View>
            <Meter value={area.current / area.required} />
            <Text style={p.caption}>
              {area.current} / {area.required} XP to the next level
            </Text>
          </View>
        ))}
        {data && areas.length === 0 && (
          <Text style={p.body}>
            Your overall level still grows. Life areas will appear here when
            available.
          </Text>
        )}
        <Text style={p.caption}>
          Levels reflect focused effort you’ve logged.
        </Text>
      </View>
      {data && (
        <View style={p.card}>
          <Text style={p.title}>The effort behind your character</Text>
          <View style={[p.inline, { flexWrap: "wrap" }]}>
            <View style={p.flex}>
              <Text style={p.value}>{totals.sessions}</Text>
              <Text style={p.caption}>Sessions completed</Text>
            </View>
            <View style={p.flex}>
              <Text style={p.value}>{totals.days}</Text>
              <Text style={p.caption}>Days you showed up</Text>
            </View>
          </View>
          <Text style={p.body}>
            {durationLabel(totals.seconds)} invested across your life.
          </Text>
        </View>
      )}
      <View style={p.card}>
        <Text style={p.title}>Milestones</Text>
        <Text style={p.body}>
          {data
            ? `${totals.milestones.filter((m) => m.unlocked).length} milestones earned. Your achievements stay with you.`
            : "Recognise the effort you’ve put in."}
        </Text>
        <PersonalRow
          icon="ribbon-outline"
          title="View milestones"
          subtitle="Achievements earned through your effort"
          onPress={() => router.navigate("/rewards")}
        />
      </View>
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
                    borderWidth: 1,
                    borderColor:
                      avatar === item ? colors.accent : "transparent",
                  },
                ]}
              >
                <Text style={{ fontSize: 26 }}>{item}</Text>
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
