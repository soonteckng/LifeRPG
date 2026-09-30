import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView, BottomSheetTextInput, TouchableOpacity as Pressable } from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../constants/theme";
import { useQuests } from "../context/QuestContext";
import { useTimer } from "../context/TimerContext";
import { useUser } from "../context/UserContext";
import { createTask, deleteTask, setTaskCompletion, updateTask, type Task } from "../services/taskService";
import { DAYS, DURATIONS, draftKey, makeQuestDraft, questParams, validateQuestDraft, type QuestDraft } from "../utils/questDraft";
import AppSheet from "./AppSheet";
import SheetConfirmation, { type SheetConfirmationProps } from "./SheetConfirmation";

interface Props { visible: boolean; onClose: () => void; onDismiss?: (navigating: boolean) => void; onStartSession?: () => void; initialScope?: "today" | "all" }
interface Editor { task: Task | null; initial: QuestDraft; draft: QuestDraft }

export default function QuestSheet({ visible, onClose, onDismiss, onStartSession, initialScope = "today" }: Props) {
  const { tasks, subjects, loading, refreshing, error, refresh, upsert, remove } = useQuests();
  const { hapticsEnabled } = useUser();
  const timer = useTimer();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [scope, setScope] = useState(initialScope);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [customDuration, setCustomDuration] = useState(false);
  const mutationLock = useRef(false);
  const [confirmation, setConfirmation] = useState<Omit<SheetConfirmationProps, "onCancel"> | null>(null);
  const closeAfterEditor = useRef(false);
  const afterDismiss = useRef<(() => void) | null>(null);
  const titleRef = useRef<React.ComponentRef<typeof BottomSheetTextInput>>(null);
  const scrollRef = useRef<React.ComponentRef<typeof BottomSheetScrollView>>(null);
  const durationY = useRef(0);
  const focusedField = useRef<"title" | "duration" | null>(null);
  const revealFocusedField = useCallback(() => {
    if (!focusedField.current) return;
    scrollRef.current?.scrollTo({ y: focusedField.current === "duration" ? durationY.current : 0, animated: true });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", revealFocusedField);
    return () => show.remove();
  }, [revealFocusedField]);

  useEffect(() => {
    if (visible) void refresh();
  }, [visible, initialScope, refresh]);

  const dirty = !!editor && draftKey(editor.draft) !== draftKey(editor.initial);
  const leaveEditor = useCallback(() => { Keyboard.dismiss(); setEditorVisible(false); }, []);
  const confirmDiscard = useCallback((action: () => void) => {
    if (mutationLock.current || confirmation) return;
    if (!dirty) { action(); return; }
    Keyboard.dismiss();
    setConfirmation({ title: "Discard changes?", message: "Your changes to this quest haven't been saved.",
      cancelLabel: "Keep editing", confirmLabel: "Discard changes",
      onConfirm: () => { setConfirmation(null); action(); },
    });
  }, [dirty, confirmation]);
  const requestClose = useCallback(() => {
    if (mutationLock.current) return;
    if (confirmation) { setConfirmation(null); return; }
    if (editor) confirmDiscard(leaveEditor);
    else onClose();
  }, [editor, confirmation, confirmDiscard, leaveEditor, onClose]);

  const openEditor = (task: Task | null) => {
    const draft = makeQuestDraft(task);
    setEditor({ task, initial: draft, draft });
    setEditorVisible(true);
    setCustomDuration(!DURATIONS.includes(Number(draft.minutes)));
    setFormError(null);
    focusedField.current = null;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    if (hapticsEnabled) void Haptics.selectionAsync();
  };
  const updateDraft = (changes: Partial<QuestDraft>) => {
    setEditor((current) => current ? { ...current, draft: { ...current.draft, ...changes } } : null);
    setFormError(null);
  };

  const mutate = async (operation: () => Promise<void>) => {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true);
    setFormError(null);
    try {
      await operation();
      if (hapticsEnabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      leaveEditor();
    } catch (error) {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : "Check your connection and try again.";
      setFormError(`Couldn't update this quest. ${detail}`);
    } finally { mutationLock.current = false; setBusy(false); }
  };
  const save = () => {
    if (!editor) return;
    const validation = validateQuestDraft(editor.draft);
    if (validation) { setFormError(validation); if (!editor.draft.title.trim()) titleRef.current?.focus(); return; }
    void mutate(async () => {
      const params = questParams(editor.draft, subjects, editor.task);
      const saved = editor.task ? await updateTask(editor.task.id, params) : await createTask(params);
      upsert(saved);
      setMessage(saved.is_due_today ? "Quest saved." : "Quest saved. You'll find it in All quests until it's due.");
    });
  };
  const activeQuest = !!editor?.task && timer.hasOpenSession && timer.linkedTaskId === editor.task.id;
  const changeCompletion = (task: Task) => {
    if (timer.hasOpenSession && timer.linkedTaskId === task.id) return;
    void mutate(async () => {
      upsert(await setTaskCompletion(task, !task.is_completed_today));
      setMessage(task.is_completed_today ? "Quest reopened." : "Quest marked complete.");
    });
  };
  const requestDelete = (task: Task) => {
    if (mutationLock.current) return;
    Keyboard.dismiss();
    if (timer.hasOpenSession && timer.linkedTaskId === task.id) {
      setConfirmation({ title: "This quest has an open session", message: "Finish or cancel its session before deleting the quest.",
        cancelLabel: "Keep quest", confirmLabel: "Continue session", onConfirm: () => { setConfirmation(null); start(); } });
      return;
    }
    setConfirmation({ title: "Delete quest?", message: `“${task.title}” will be removed${task.is_recurring ? ", including future repeats" : ""}. This cannot be undone.`,
      cancelLabel: "Keep quest", confirmLabel: "Delete quest", onConfirm: () => { setConfirmation(null); void mutate(async () => {
        await deleteTask(task.id); remove(task.id); setMessage("Quest deleted.");
      }); },
    });
  };
  const start = (task?: Task) => {
    // Never change any part of an already active or paused session.
    if (!timer.hasOpenSession && task) {
      timer.setLinkedTaskId(task.id);
      timer.setDurationInMinutes(task.target_minutes || 30);
      timer.setTargetAttributeId(task.subject_id ?? null);
    }
    if (hapticsEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Navigate only after the outgoing sheet has finished its dismissal animation.
    afterDismiss.current = onStartSession ?? (() => router.push("/session"));
    if (editor) { closeAfterEditor.current = true; leaveEditor(); }
    else onClose();
  };

  const today = tasks.filter((task) => task.is_due_today);
  const unfinished = today.filter((task) => !task.is_completed_today);
  const shown = (scope === "today" ? today : tasks).slice().sort((a, b) =>
    Number(a.is_completed_today) - Number(b.is_completed_today) || Number(b.is_due_today) - Number(a.is_due_today));

  const editorHeader = editor ? (
    <View>
      <Text style={styles.editorTitle} accessibilityRole="header" maxFontSizeMultiplier={1.3}>{editor.task ? "Edit quest" : "New quest"}</Text>
    <View style={styles.editorHeader}>
      <Pressable onPress={requestClose} disabled={busy} style={styles.headerAction} accessibilityRole="button">
        <Text style={[styles.link, busy && styles.disabled]} maxFontSizeMultiplier={1.5}>Cancel</Text>
      </Pressable>

      <Pressable onPress={save} disabled={busy} style={styles.save} accessibilityRole="button" accessibilityLabel={editor.task ? "Save changes" : "Create quest"} accessibilityState={{ busy, disabled: busy }}>
        {busy ? <ActivityIndicator color={colors.background} size="small" /> : <Text style={styles.saveText} maxFontSizeMultiplier={1.5}>{editor.task ? "Save changes" : "Create quest"}</Text>}
      </Pressable>
    </View>
    {formError && <Text style={styles.headerError} accessibilityRole="alert" accessibilityLiveRegion="polite">{formError}</Text>}
    </View>
  ) : null;
  const listHeader = (
    <View style={styles.header}>
      <View style={styles.headingRow}>
        <Text style={styles.title} accessibilityRole="header">{scope === "today" ? "Today's quests" : "All quests"}</Text>
        <Pressable style={styles.add} onPress={() => openEditor(null)} accessibilityRole="button" accessibilityLabel="Add quest">
          <Ionicons name="add" size={18} color={colors.accent} />
          <Text style={styles.addText}>Add quest</Text>
        </Pressable>
      </View>
      <View style={styles.subheadingRow}>
        <Text style={styles.subtitle}>{scope === "today" ? `${unfinished.length} remaining · ${today.length - unfinished.length} complete` : `${tasks.length} quests · your own pace`}</Text>
        <Pressable style={styles.scopeButton} onPress={() => { setScope(scope === "today" ? "all" : "today"); setMessage(null); }} accessibilityRole="button">
          <Text style={styles.linkSmall}>{scope === "today" ? "All quests" : "Today"}</Text>
          <Ionicons name={scope === "today" ? "chevron-forward" : "chevron-back"} size={13} color={colors.accent} />
        </Pressable>
      </View>
      {timer.hasOpenSession && (
        <Pressable style={styles.sessionNotice} onPress={() => start()} accessibilityRole="button">
          <Text style={styles.noticeText}>Your current session is still open.</Text>
          <Text style={styles.linkSmall}>Continue</Text>
        </Pressable>
      )}
    </View>
  );

  const confirmationOverlay = confirmation ? <SheetConfirmation {...confirmation} onCancel={() => setConfirmation(null)} /> : null;
  return (
    <AppSheet visible={visible} onRequestClose={requestClose} onDismiss={() => {
      setEditor(null); setEditorVisible(false); setFormError(null); setScope(initialScope); setMessage(null);
      const next = afterDismiss.current; afterDismiss.current = null; onDismiss?.(!!next); next?.();
    }} guardDismiss={busy || !!confirmation || !!editor} label="quests" header={listHeader}
      overlay={<>
        {!editor && confirmationOverlay}
        {editor && <AppSheet visible={editorVisible} onRequestClose={requestClose}
          onDismiss={() => { setEditor(null); setFormError(null); focusedField.current = null;
            if (closeAfterEditor.current) { closeAfterEditor.current = false; onClose(); } }}
          guardDismiss maxHeightRatio={0.94} label="quest editor" header={editorHeader} overlay={confirmationOverlay}>
          <BottomSheetScrollView ref={scrollRef} onLayout={revealFocusedField}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
            contentContainerStyle={[styles.body, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
          <View pointerEvents={busy ? "none" : "auto"} style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Quest name</Text>
              <BottomSheetTextInput ref={titleRef} value={editor.draft.title} onChangeText={(title) => updateDraft({ title })}
                placeholder="What would you like to do?" placeholderTextColor={colors.muted} style={styles.input}
                onFocus={() => { focusedField.current = "title"; revealFocusedField(); }} onBlur={() => { focusedField.current = null; }}
                maxLength={120} multiline accessibilityLabel="Quest name" editable={!busy} />
            </View>
            <View style={styles.field} onLayout={(event) => { durationY.current = event.nativeEvent.layout.y; }}>
              <Text style={styles.label}>Duration <Text style={styles.subtitle}>· minutes</Text></Text>
              <View style={styles.options}>
                {DURATIONS.map((minutes) => <Choice key={minutes} label={String(minutes)} accessibilityLabel={`${minutes} minutes`}
                  selected={!customDuration && Number(editor.draft.minutes) === minutes}
                  onPress={() => { updateDraft({ minutes: String(minutes) }); setCustomDuration(false); }} />)}
                <Choice label="Custom" selected={customDuration} onPress={() => setCustomDuration(true)} />
              </View>
              {customDuration && <BottomSheetTextInput value={editor.draft.minutes} onChangeText={(minutes) => updateDraft({ minutes })}
                onFocus={() => { focusedField.current = "duration"; revealFocusedField(); }} onBlur={() => { focusedField.current = null; }}
                keyboardType="number-pad" style={styles.input} accessibilityLabel="Custom duration in minutes" maxLength={3} editable={!busy} />}
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Repeat</Text>
              <View style={styles.options}>
                {([ ["once", "Doesn’t repeat"], ["daily", "Every day"], ["custom", "Selected days"] ] as const).map(([repeat, label]) =>
                  <Choice key={repeat} label={label} selected={editor.draft.repeat === repeat} onPress={() => updateDraft({ repeat })} />)}
              </View>
              {editor.draft.repeat === "custom" ? <View style={styles.daysRow}>
                {DAYS.map((day, index) => {
                  const selected = editor.draft.days.includes(day);
                  const fullName = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][index];
                  return <View key={day} style={styles.dayContainer}><Pressable
                    style={[styles.day, selected && styles.choiceSelected]} accessibilityRole="button"
                    accessibilityLabel={fullName} accessibilityState={{ selected }}
                    onPress={() => updateDraft({
                      days: selected ? editor.draft.days.filter((value) => value !== day) : [...editor.draft.days, day],
                    })}>
                    <Text style={[styles.dayText, selected && styles.choiceTextSelected]} maxFontSizeMultiplier={1.4}>{day[0]}</Text>
                  </Pressable></View>;
                })}
              </View> : <Text style={styles.helper}>{editor.draft.repeat === "once" ? "Available today and stays available until completed." : "A fresh start, every day."}</Text>}
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Life area</Text>
              <Text style={styles.helper}>Quests and their sessions are linked to this life area.</Text>
              <View style={styles.options}>
                <Choice label="General" selected={editor.draft.subjectId === null || subjects.find((subject) => subject.id === editor.draft.subjectId)?.title === "General"}
                  onPress={() => updateDraft({ subjectId: null })} />
                {subjects.filter((subject) => subject.title !== "General").map((subject) => <Choice key={subject.id} label={subject.title}
                  selected={editor.draft.subjectId === subject.id} onPress={() => updateDraft({ subjectId: subject.id })} />)}
              </View>
            </View>
            {activeQuest && <Text style={styles.helper}>This quest has an open session. Edits apply to future sessions. Finish or cancel the current session before completing or deleting this quest.</Text>}

          </View>
          </BottomSheetScrollView>
        </AppSheet>}
      </>}>
      <BottomSheetScrollView contentContainerStyle={[styles.body, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>

          <>
            {!editor && formError && <Text style={styles.headerError} accessibilityRole="alert">{formError}</Text>}
            {message && <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text>}
            {error && <Pressable style={styles.errorBanner} onPress={() => void refresh()} accessibilityRole="button">
                <Text style={styles.helper}>{tasks.length ? "Couldn't refresh quests. Your last loaded quests are shown." : "Couldn't load quests. Please try again."}</Text>
              <Text style={styles.linkSmall}>{refreshing ? "Refreshing…" : "Try again"}</Text>
            </Pressable>}
            {loading ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : error && tasks.length === 0 ? null : shown.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>{tasks.length ? "Nothing scheduled for today." : "Create your first quest."}</Text>
                <Text style={styles.emptyText}>{tasks.length ? "Your other quests are in All quests." : "Give one thing your attention today."}</Text>
                <Pressable style={styles.emptyAdd} onPress={() => tasks.length ? setScope("all") : openEditor(null)} accessibilityRole="button"><Text style={styles.addText}>{tasks.length ? "View all quests" : "Add quest"}</Text></Pressable>
              </View>
            ) : <>
              {scope === "today" && unfinished.length === 0 && <Text style={styles.doneMessage}>All done for today.</Text>}
              {shown.map((task) => {
                const subject = subjects.find((item) => item.id === task.subject_id);
                return <View key={task.id} style={styles.questRow}>
                  <Pressable style={styles.completeButton} onPress={() => changeCompletion(task)} disabled={busy || (timer.hasOpenSession && timer.linkedTaskId === task.id)} accessibilityRole="checkbox" accessibilityState={{ checked: task.is_completed_today, disabled: busy || (timer.hasOpenSession && timer.linkedTaskId === task.id) }} accessibilityLabel={`${task.is_completed_today ? "Mark unfinished" : "Mark complete"}: ${task.title}`}>
                    <Ionicons name={task.is_completed_today ? "checkmark-circle" : "ellipse-outline"} size={23} color={task.is_completed_today ? colors.accent : colors.muted} />
                  </Pressable>
                  <View style={styles.questMainContainer}><Pressable style={styles.questMain} onPress={() => openEditor(task)} accessibilityRole="button" accessibilityLabel={`Edit ${task.title}`}
                    accessibilityHint="Edit name, duration, repeat, and life area">
                    <View style={styles.questTitleRow}>
                      <Text style={[styles.questTitle, task.is_completed_today && styles.completed]}>{task.title}</Text>
                      <Ionicons name="create-outline" size={16} color={colors.muted} />
                    </View>
                    <Text style={styles.meta}>{subject?.title ?? "General"} · {task.target_minutes || 30} min</Text>
                    <Text style={styles.schedule}>{task.is_completed_today ? "Completed" : !task.is_due_today ? "Upcoming · " : ""}{!task.is_completed_today && (task.repeat_rule === "daily" ? "Every day" : task.repeat_rule === "once" ? "Doesn’t repeat" : task.repeat_rule.split(",").join(", "))}</Text>
                  </Pressable></View>
                  {!task.is_completed_today && task.is_due_today && !timer.hasOpenSession && <View style={styles.startContainer}><Pressable style={styles.start} onPress={() => start(task)} accessibilityRole="button" accessibilityLabel={`Start ${task.title}`}>
                    <Ionicons name="play" size={14} color={colors.accent} /><Text style={styles.startText}>Start</Text>
                  </Pressable></View>}
                  <Pressable style={styles.deleteButton} onPress={() => requestDelete(task)} disabled={busy}
                    accessibilityRole="button" accessibilityLabel={`Delete ${task.title}`}>
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </Pressable>

                </View>;
              })}
            </>}
          </>
      </BottomSheetScrollView>
    </AppSheet>
  );
}

function Choice({ label, selected, onPress, accessibilityLabel }: { label: string; selected: boolean; onPress: () => void; accessibilityLabel?: string }) {
  return <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]} accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected }}>
    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 22, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  headingRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 12 },
  title: { color: colors.text, fontSize: 23, fontWeight: "700", letterSpacing: -0.6, flexGrow: 1, flexShrink: 1 },
  add: { minHeight: 44, flexDirection: "row", gap: 4, alignItems: "center" },
  addText: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  subheadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  subtitle: { color: colors.secondary, fontSize: 12, fontWeight: "400", flexShrink: 1 },
  scopeButton: { minHeight: 44, flexDirection: "row", gap: 4, alignItems: "center" },
  linkSmall: { color: colors.accent, fontSize: 12, fontWeight: "600" },
  sessionNotice: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between", paddingVertical: 12 },
  noticeText: { color: colors.secondary, fontSize: 12, flexShrink: 1 },
  body: { paddingHorizontal: 22 },
  completeButton: { minWidth: 44, minHeight: 48, alignItems: "center", justifyContent: "center" },
  deleteButton: { minWidth: 44, minHeight: 50, alignItems: "center", justifyContent: "center" },
  loading: { marginVertical: 45 },
  doneMessage: { color: colors.accent, fontSize: 18, fontWeight: "600", paddingTop: 20, paddingBottom: 8 },
  editHint: { color: colors.muted, fontSize: 11, marginTop: 14, marginBottom: 2 },
  questRow: { width: "100%", justifyContent: "space-between", flexDirection: "row", alignItems: "center", gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  questMainContainer: { flex: 1, minWidth: 0 },
  questMain: { width: "100%", paddingVertical: 18, gap: 5 },
  questTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  questTitle: { color: colors.text, fontSize: 16, fontWeight: "600", flexShrink: 1, lineHeight: 22 },
  completed: { color: colors.secondary },
  meta: { color: colors.secondary, fontSize: 12, lineHeight: 18 },
  schedule: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  startContainer: { marginLeft: "auto", flexShrink: 0 },
  start: { minWidth: 96, minHeight: 50, paddingHorizontal: 18, justifyContent: "center", borderRadius: 12, backgroundColor: colors.accentSoft, flexDirection: "row", alignItems: "center", gap: 5 },
  startText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  empty: { paddingVertical: 30, gap: 10, alignItems: "flex-start" },
  emptyTitle: { fontSize: 20, lineHeight: 27, fontWeight: "600", color: colors.text },
  emptyText: { fontSize: 14, lineHeight: 21, color: colors.secondary, maxWidth: 300 },
  emptyAdd: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, backgroundColor: colors.accentSoft, borderRadius: 10, marginTop: 5 },
  editorHeader: { justifyContent: "space-between", flexWrap: "wrap", paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  headerAction: { minHeight: 44, paddingHorizontal: 6, justifyContent: "center" },
  link: { color: colors.accent, fontSize: 15 },
  editorTitle: { color: colors.text, fontSize: 17, fontWeight: "600", paddingHorizontal: 22, paddingBottom: 8, textAlign: "center" },
  save: { minWidth: 120, minHeight: 44, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.accent, justifyContent: "center", alignItems: "center" },
  saveText: { color: colors.background, fontSize: 14, fontWeight: "700" },
  form: { gap: 14, paddingTop: 12 },
  field: { gap: 8 },
  label: { color: colors.text, fontSize: 14, fontWeight: "600" },
  input: { color: colors.text, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: colors.line, borderRadius: 12, minHeight: 50, padding: 14, fontSize: 16, textAlignVertical: "top" },
  daysRow: { flexDirection: "row", gap: 4 },
  dayContainer: { flex: 1, minWidth: 0 },
  day: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  dayText: { color: colors.secondary, fontSize: 14, fontWeight: "500" },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { minHeight: 44, minWidth: 46, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: colors.line, justifyContent: "center", alignItems: "center" },
  choiceSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  choiceText: { color: colors.secondary, fontSize: 13 },
  choiceTextSelected: { color: colors.accent, fontWeight: "600" },
  helper: { color: colors.secondary, fontSize: 12, lineHeight: 18 },
  headerError: { color: colors.danger, fontSize: 13, lineHeight: 19, paddingHorizontal: 22, paddingBottom: 12 },
  errorBanner: { paddingVertical: 14, gap: 10 },
  message: { paddingTop: 14, color: colors.accent, fontSize: 12, lineHeight: 18 },
  actions: { backgroundColor: colors.surface, paddingHorizontal: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 8 },
  actionRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 10 },
  deleteText: { color: colors.danger, fontSize: 15 },
  disabled: { opacity: 0.4 },
});
