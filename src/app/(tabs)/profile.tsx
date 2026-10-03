import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetScrollView,
  BottomSheetTextInput,
  TouchableOpacity as SheetButton,
} from "@gorhom/bottom-sheet";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Keyboard, Pressable, Text, View } from "react-native";
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
import {
  ATTRIBUTES,
  characterAttributes,
  earnedMilestones,
  type AreaMapping,
} from "../../utils/characterGrowth";
import { durationLabel } from "../../utils/progressAnalytics";

const AVATARS = ["🧙‍♂️", "🧝‍♂️", "🏋️", "🧑‍💻", "🎨", "🥷", "🤖", "🌱", "⭐", "🐱"];
export default function ProfileScreen() {
  const router = useRouter();
  const { profile, updateProfile, reloadProfile } = useUser();
  const { data, loading, error, refresh, saveMapping } = useCharacterData();
  const [sheet, setSheet] = useState<"identity" | "areas" | null>(null);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [mapping, setMapping] = useState<AreaMapping>({});
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [saveError, setSaveError] = useState("");
  const [discard, setDiscard] = useState(false);
  useFocusEffect(
    useCallback(() => {
      void reloadProfile();
    }, [reloadProfile]),
  );
  const attributes = characterAttributes(
    data?.areas ?? [],
    data?.mapping ?? {},
  );
  const totals = earnedMilestones(data?.sessions ?? [], profile.timezone);
  const required = Math.floor(100 * Math.pow(Math.max(1, profile.level), 1.5));
  const open = (kind: "identity" | "areas") => {
    setName(profile.username);
    setAvatar(profile.avatar);
    setMapping(data?.mapping ?? {});
    setSaveError("");
    setDiscard(false);
    setSheet(kind);
  };
  const dirty =
    sheet === "identity"
      ? name.trim() !== profile.username || avatar !== profile.avatar
      : JSON.stringify(mapping) !== JSON.stringify(data?.mapping ?? {});
  const close = () => {
    if (lock.current) return;
    if (dirty) setDiscard(true);
    else {
      Keyboard.dismiss();
      setSheet(null);
    }
  };
  const save = async () => {
    if (lock.current) return;
    if (sheet === "identity" && (!name.trim() || name.trim().length > 40)) {
      setSaveError("Enter a name between 1 and 40 characters.");
      return;
    }
    lock.current = true;
    setSaving(true);
    setSaveError("");
    try {
      if (sheet === "identity")
        await updateProfile(name.trim(), avatar, profile.class_title);
      else await saveMapping(mapping);
      Keyboard.dismiss();
      setSheet(null);
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
          strength={attributes[0].level}
          developed={attributes.filter((a) => a.total > 0).length}
        />
        <View style={{ alignItems: "center", gap: 6 }}>
          <Text style={[p.title, { fontSize: 26 }]}>{profile.username}</Text>
          <Text style={p.body}>Built one session at a time.</Text>
        </View>
        <Meter value={profile.current_xp / required} />
        <Text style={p.caption}>
          {profile.current_xp} / {required} XP to level {profile.level + 1}
        </Text>
        <PersonalButton
          title="Personalise profile"
          secondary
          onPress={() => open("identity")}
        />
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
        <View style={p.inline}>
          <Text style={[p.title, p.flex]}>Your attributes</Text>
          <Pressable
            disabled={!data}
            accessibilityRole="button"
            accessibilityLabel="Connect Life areas to attributes"
            onPress={() => open("areas")}
            style={p.pill}
          >
            <Text style={p.label}>Connect areas</Text>
          </Pressable>
        </View>
        <Text style={p.body}>
          Choose what each Life area develops. Your earned XP stays with its
          area.
        </Text>
        {attributes.map((attribute) => (
          <View key={attribute.id} style={{ gap: 9, paddingVertical: 8 }}>
            <View style={p.inline}>
              <Ionicons
                name={attribute.icon}
                size={21}
                color={attribute.color}
              />
              <View style={p.flex}>
                <Text style={p.rowTitle}>{attribute.title}</Text>
                <Text style={p.caption}>
                  {attribute.areas.length
                    ? attribute.areas.map((a) => a.title).join(" · ")
                    : "No Life areas connected"}
                </Text>
              </View>
              <Text style={p.rowTitle}>Lv {attribute.level}</Text>
            </View>
            <Meter
              value={attribute.current / attribute.required}
              color={attribute.color}
            />
            <Text style={p.caption}>
              {attribute.current} / {attribute.required} XP
            </Text>
          </View>
        ))}
        {data?.areas.some((a) => !data.mapping[String(a.id)]) && (
          <Text style={p.caption}>
            Some areas are not connected yet. Their XP is saved and will appear
            when you connect them.
          </Text>
        )}
        <Text style={p.caption}>
          Attributes reflect logged effort, rather than measured fitness or
          ability.
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
          <PersonalRow
            icon="analytics-outline"
            title="Explore your progress"
            subtitle="Time, consistency and Life areas"
            onPress={() => router.navigate("/progress")}
          />
        </View>
      )}
      <View style={p.card}>
        <Text style={p.title}>Milestones & rewards</Text>
        <Text style={p.body}>
          {data
            ? `${totals.milestones.filter((m) => m.unlocked).length} milestones earned. Your achievements stay with you.`
            : "Recognise the effort you’ve put in."}
        </Text>
        <PersonalRow
          icon="ribbon-outline"
          title="View rewards"
          subtitle="Earned milestones and personal treats"
          onPress={() => router.navigate("/rewards")}
        />
      </View>
      <AppSheet
        visible={sheet !== null}
        onRequestClose={close}
        guardDismiss
        label={
          sheet === "identity" ? "Personalise profile" : "Connect Life areas"
        }
        header={
          <View style={p.sheetHeader}>
            <Text style={p.title}>
              {sheet === "identity"
                ? "Make it yours"
                : "Connect your Life areas"}
            </Text>
            <Text style={p.body}>
              {sheet === "identity"
                ? "Your name and character badge."
                : "Choose the attribute each area represents."}
            </Text>
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
                setSheet(null);
              }}
            />
          ) : undefined
        }
      >
        <BottomSheetScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={p.sheetBody}
        >
          {sheet === "identity" ? (
            <>
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
                {AVATARS.map((item) => (
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
            </>
          ) : (
            <>
              <Text style={p.caption}>
                These connections are saved for this account on this device.
                They don’t change quests, XP or rewards.
              </Text>
              {data?.areas.length === 0 && (
                <Text style={p.body}>
                  No Life areas yet. Your sessions can still grow your overall
                  level.
                </Text>
              )}
              {data?.areas.map((area) => (
                <View key={area.id} style={{ gap: 10 }}>
                  <Text style={p.rowTitle}>
                    {area.title} · Area level {area.level}
                  </Text>
                  <View style={[p.inline, { flexWrap: "wrap" }]}>
                    {ATTRIBUTES.map((a) => (
                      <SheetButton
                        key={a.id}
                        disabled={saving}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: mapping[String(area.id)] === a.id,
                        }}
                        onPress={() =>
                          setMapping((current) => ({
                            ...current,
                            [String(area.id)]: a.id,
                          }))
                        }
                        style={[
                          p.pill,
                          {
                            borderWidth: 1,
                            borderColor:
                              mapping[String(area.id)] === a.id
                                ? a.color
                                : "transparent",
                          },
                        ]}
                      >
                        <Text style={[p.caption, { color: a.color }]}>
                          {a.title}
                        </Text>
                      </SheetButton>
                    ))}
                    <SheetButton
                      disabled={saving}
                      onPress={() =>
                        setMapping((current) => {
                          const next = { ...current };
                          delete next[String(area.id)];
                          return next;
                        })
                      }
                      accessibilityRole="button"
                      style={p.pill}
                    >
                      <Text style={p.caption}>Unassigned</Text>
                    </SheetButton>
                  </View>
                </View>
              ))}
            </>
          )}
          {!!saveError && (
            <Text style={p.error} accessibilityRole="alert">
              {saveError}
            </Text>
          )}
          <PersonalButton
            title={saving ? "Saving…" : "Save changes"}
            disabled={saving}
            onPress={() => void save()}
          />
        </BottomSheetScrollView>
      </AppSheet>
    </PersonalPage>
  );
}
