import { useLayoutEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView, TouchableOpacity as SheetButton } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useSessionProtection } from "../context/SessionProtectionContext";
import { useTimer } from "../context/TimerContext";
import { useUser } from "../context/UserContext";
import { colors } from "../constants/theme";
import { enableNotifications, openNotificationSettings } from "../services/notificationPermissionService";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import AppSheet from "./AppSheet";

type Mode = "normal" | "allow-list" | "essentials";
const modeName = (mode: Mode) => mode === "normal" ? "Normal" : mode === "allow-list" ? "Allow list" : "Block apps";

export default function SessionProtectionControl({ statusOnly = false, activeSurface = true }: { statusOnly?: boolean; activeSurface?: boolean }) {
  const protection = useSessionProtection();
  const timer = useTimer();
  const [open, setOpen] = useState(false);
  if (!activeSurface && open) setOpen(false);
  const protectedNow = protection.active;
  const interrupted = ["interrupted", "permission-lost"].includes(protection.state.status);
  const label = protectedNow ? "Protected" : interrupted ? "Protection interrupted" : protection.selection.mode === "normal" ? "Normal · timer only" : `${modeName(protection.selection.mode)}${timer.hasOpenSession ? " · not covering apps" : ""}`;
  return <>
    <Pressable testID="session-protection-control" disabled={!activeSurface} style={[s.control, statusOnly && s.status]} onPress={() => { if (activeSurface) setOpen(true); }} accessibilityRole="button" accessibilityLabel={`${label}. Session protection settings`}>
      <Ionicons name={protectedNow ? "shield-checkmark-outline" : interrupted ? "shield-half-outline" : "shield-outline"} size={16} color={protectedNow ? colors.protection : colors.secondary} />
      <Text style={[s.controlText, protectedNow && { color: colors.protection }]}>{label}</Text>
      <Text style={s.link}>{statusOnly ? "Details" : "Change"}</Text>
    </Pressable>
    <ProtectionSettingsSheet visible={open && activeSurface} onClose={() => setOpen(false)} />
  </>;
}

export function ProtectionSettingsSheet({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const protection = useSessionProtection(), timer = useTimer(), { hapticsEnabled } = useUser(), insets = useSafeAreaInsets();
  const { profile } = useUser();
  const [view, setView] = useState({ visible, ownerId: profile?.id });
  const [mode, setMode] = useState<Mode>(protection.selection.mode);
  const [allowed, setAllowed] = useState<string[]>(protection.selection.allowed);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const currentView = useRef(view);
  useLayoutEffect(() => { currentView.current = view; return () => { currentView.current = { visible: false, ownerId: "" }; }; }, [view]);
  if (visible !== view.visible || profile?.id !== view.ownerId) {
    setView({ visible, ownerId: profile?.id });
    if (visible) { setMode(protection.selection.mode); setAllowed(protection.selection.allowed); setMessage(""); setSaving(false); }
  }
  const isCurrent = () => currentView.current === view && view.visible;
  const feedback = () => { if (hapticsEnabled) void Haptics.selectionAsync().catch(() => {}); };
  const locked = !!timer.hasOpenSession;
  const protectedChoice = mode !== "normal";
  const permissionsReady = !!(protection.capabilities?.usage && protection.capabilities?.overlay && protection.capabilities?.notifications);
  const canRestore = locked && !protection.active && protection.selection.mode !== "normal" && mode === protection.selection.mode;
  const applyDisabled = saving || !protection.loaded || protectedChoice && (!protection.supported || !permissionsReady) || locked && mode !== "normal" && !canRestore;
  const apply = async () => {
    if (applyDisabled || !isCurrent()) return;
    const expectedOwner = profile?.id;
    const expectedView = currentView.current;
    setSaving(true); setMessage("");
    try {
      const saved = await protection.choose(mode, mode === "allow-list" ? allowed : []);
      if (currentView.current !== expectedView || !currentView.current.visible || currentView.current.ownerId !== expectedOwner) return;
      if (saved) onClose(); else setMessage("Your choice wasn’t saved. Check the permissions below and try again.");
    } catch { if (currentView.current === expectedView && currentView.current.visible && currentView.current.ownerId === expectedOwner) setMessage("Couldn’t save protection settings. Your timer is still available."); }
    finally { if (currentView.current === expectedView && currentView.current.visible && currentView.current.ownerId === expectedOwner) setSaving(false); }
  };
  return <AppSheet visible={visible} onRequestClose={() => { if (!saving) onClose(); }} guardDismiss={saving} compact maxHeightRatio={0.88} label="session protection" motionMode="timed"
    header={<View style={s.sheetHeading}><Text style={s.sheetTitle}>A little space to focus</Text><Text style={s.body}>Choose what can open during your session.</Text></View>}
    footer={<View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}><SheetButton disabled={applyDisabled} onPress={() => void apply()} accessibilityRole="button" style={[s.primary, applyDisabled && s.disabled]}><Text style={s.primaryText}>{saving ? "Saving…" : locked && mode === "normal" ? "Turn off protection" : canRestore ? "Restore protection" : locked ? "Session in progress" : "Use this mode"}</Text></SheetButton></View>}>
    <BottomSheetScrollView enableFooterMarginAdjustment contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled">
      {locked && <Text style={s.body}>Your session’s app choices stay fixed until it ends. You can turn protection off at any time.</Text>}
      {([
        { value: "normal", title: "Normal", detail: "Timer only. Use your phone as usual.", icon: "time-outline" },
        { value: "allow-list", title: "Allow list", detail: "Keep your chosen tools available. Cover other apps.", icon: "shield-checkmark-outline" },
        { value: "essentials", title: "Block apps", detail: "Cover other apps while keeping essential system apps available.", icon: "shield-outline" },
      ] as const).map(item => <SheetButton key={item.value} disabled={saving || locked && item.value !== "normal" && item.value !== protection.selection.mode} onPress={() => { if (!isCurrent()) return; feedback(); setMode(item.value); setMessage(""); if (item.value !== "normal") void protection.refresh(); }} accessibilityRole="radio" accessibilityState={{ selected: mode === item.value, disabled: saving || locked && item.value !== "normal" && item.value !== protection.selection.mode }} accessibilityLabel={`${item.title}. ${item.detail}`} style={[s.mode, mode === item.value && s.modeSelected]}>
        <Ionicons name={item.icon} size={21} color={mode === item.value ? colors.protection : colors.secondary} /><View style={s.detail}><Text style={s.modeTitle}>{item.title}</Text><Text style={s.caption}>{item.detail}</Text></View><Ionicons name={mode === item.value ? "radio-button-on" : "radio-button-off"} size={20} color={mode === item.value ? colors.protection : colors.muted} />
      </SheetButton>)}
      <View style={s.safety}><Ionicons name="call-outline" size={16} color={colors.protection} /><Text style={[s.caption, { flex: 1 }]}>Calls, emergency access, Settings and LifeRPG stay available. End session is always reachable.</Text></View>
      {protectedChoice && !protection.supported && <Text style={s.body}>App protection needs the updated Android app. Normal sessions work on this device.</Text>}
      {protectedChoice && protection.supported && <View style={s.permissions}>
        <Text style={s.modeTitle}>Allow protection on this phone</Text><Text style={s.caption}>Usage Access detects which app is open. Display over other apps lets LifeRPG cover a blocked app. These choices stay on your phone.</Text>
        {([{kind:"usage", label:"Usage Access", granted:protection.capabilities?.usage}, {kind:"overlay", label:"Display over other apps", granted:protection.capabilities?.overlay}] as const).map(item => <View style={s.permissionRow} key={item.kind}><View style={s.detail}><Text style={s.body}>{item.label}</Text><Text style={s.caption}>{item.granted ? "Allowed" : "Needed for protected sessions"}</Text></View><SheetButton accessibilityRole="button" accessibilityLabel={`${item.granted ? "Review" : "Allow"} ${item.label}`} onPress={() => void protection.openPermission(item.kind)} style={s.permissionAction}><Text style={s.link}>{item.granted ? "Review" : "Allow"}</Text></SheetButton></View>)}
        <View style={s.permissionRow}><View style={s.detail}><Text style={s.body}>Notifications</Text><Text style={s.caption}>{protection.capabilities?.notifications ? "Allowed · keeps the stop control visible" : "Keeps protection’s stop control visible"}</Text></View><SheetButton accessibilityRole="button" accessibilityLabel="Allow protection notifications" onPress={() => void (async () => { try { const permission = await enableNotifications(); if (!permission.granted && permission.action === "settings") await openNotificationSettings(); await protection.refresh(); } catch { setMessage("Open LifeRPG’s notification settings to allow its protection notification."); } })()} style={s.permissionAction}><Text style={s.link}>{protection.capabilities?.notifications ? "Review" : "Allow"}</Text></SheetButton></View>
      </View>}
      {mode === "allow-list" && protection.supported && <View style={s.permissions}>
        <Text style={s.modeTitle}>Your allowed apps</Text><Text style={s.caption}>Choose the tools you need. Essential system apps are already allowed.</Text>
        {!protection.apps.length && <SheetButton onPress={() => void protection.refresh()} accessibilityRole="button" style={s.permissionAction}><Text style={s.link}>Load apps on this phone</Text></SheetButton>}
        {protection.apps.map(app => { const selected = allowed.includes(app.packageName); return <SheetButton key={app.packageName} disabled={locked || saving} onPress={() => { if (!isCurrent()) return; feedback(); setAllowed(current => current.includes(app.packageName) ? current.filter(value => value !== app.packageName) : current.length < 64 ? [...current, app.packageName] : current); }} accessibilityRole="checkbox" accessibilityState={{checked:selected,disabled:locked || saving}} accessibilityLabel={app.label} style={s.permissionRow}><Text style={[s.body, s.detail]}>{app.label}</Text><Ionicons name={selected ? "checkbox" : "square-outline"} size={21} color={selected ? colors.protection : colors.muted} /></SheetButton>; })}
        {allowed.length >= 64 && <Text style={s.caption}>You can keep up to 64 apps on your allow list.</Text>}
      </View>}
      {!!(message || protection.error) && <Text accessibilityRole="alert" style={s.error}>{message || protection.error}</Text>}
    </BottomSheetScrollView>
  </AppSheet>;
}
const s = StyleSheet.create({
  control:{minHeight:48,flexDirection:"row",alignItems:"center",gap:8,paddingHorizontal:14,borderRadius:16,backgroundColor:"rgba(255,255,255,0.04)"}, status:{alignSelf:"center",width:"100%",maxWidth:340,paddingHorizontal:14,borderRadius:16,backgroundColor:colors.surface},controlText:{flex:1,color:colors.secondary,fontSize:13,lineHeight:19},link:{color:colors.accent,fontSize:14,fontWeight:"500"},
  sheetHeading:{paddingHorizontal:20,paddingBottom:12,gap:6},sheetTitle:{fontSize:23,lineHeight:29,fontWeight:"600",color:colors.text,letterSpacing:-0.4},body:{fontSize:15,lineHeight:22,color:colors.secondary},caption:{fontSize:13,lineHeight:19,color:colors.secondary},sheetBody:{paddingHorizontal:20,paddingBottom:20,gap:12},
  mode:{flexDirection:"row",alignItems:"center",gap:12,padding:15,minHeight:78,borderRadius:18,backgroundColor:colors.surface,borderWidth:1,borderColor:"transparent"},modeSelected:{backgroundColor:"rgba(56,209,181,0.08)",borderColor:colors.protection},modeTitle:{fontSize:16,lineHeight:22,fontWeight:"600",color:colors.text},detail:{flex:1,minWidth:0,gap:3},safety:{flexDirection:"row",gap:8,paddingVertical:6,paddingRight:20},permissions:{gap:8,paddingTop:8},permissionRow:{flexDirection:"row",alignItems:"center",gap:10,minHeight:52,paddingVertical:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.line},permissionAction:{minHeight:44,minWidth:52,alignItems:"center",justifyContent:"center"},
  footer:{paddingHorizontal:20,paddingTop:12,backgroundColor:colors.surfaceRaised},primary:{minHeight:52,padding:14,borderRadius:16,backgroundColor:colors.primary,alignItems:"center",justifyContent:"center"},primaryText:{color:colors.primaryText,fontSize:17,lineHeight:23,fontWeight:"600"},disabled:{opacity:0.45},error:{fontSize:14,lineHeight:21,color:colors.danger},
});
