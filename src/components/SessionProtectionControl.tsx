import { tapHaptic } from "../utils/tapHaptics";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import SheetButton from "./SheetTouchable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSessionProtection } from "../context/SessionProtectionContext";
import { useTimer } from "../context/TimerContext";
import { useUser } from "../context/UserContext";
import { colors, edge } from "../constants/theme";
import { enableNotifications, openNotificationSettings } from "../services/notificationPermissionService";
import { Text } from "./AppText";
import Pressable from "./MotionPressable";
import AppSheet from "./AppSheet";
import SheetHeader from "./SheetHeader";

type Mode = "normal" | "allow-list" | "essentials";
// One mode for now: everything is covered except the apps you allow. An older
// "block everything" choice is the same thing with no apps allowed.
const modeName = (mode: Mode) => mode === "normal" ? "Normal" : "Allow list";

export default function SessionProtectionControl({ statusOnly = false, activeSurface = true }: { statusOnly?: boolean; activeSurface?: boolean }) {
  const protection = useSessionProtection();
  const timer = useTimer();
  const [open, setOpen] = useState(false);
  if (!activeSurface && open) setOpen(false);
  const [setupPromptSeen, setSetupPromptSeen] = useState(false);
  if (timer.protectionSetupRequired && activeSurface && !setupPromptSeen) { setSetupPromptSeen(true); setOpen(true); }
  if (!timer.protectionSetupRequired && setupPromptSeen) setSetupPromptSeen(false);
  const protectedNow = protection.active;
  const checking = protection.state.status === "checking";
  const interrupted = ["interrupted", "permission-lost"].includes(protection.state.status);
  const label = timer.breakSecondsLeft > 0 ? "On break · protection returns automatically" : checking ? "Checking protection…" : protectedNow ? "Protected" : interrupted ? "Protection interrupted" : protection.selection.mode === "normal" ? "Set up protection" : `${modeName(protection.selection.mode)}${timer.hasOpenSession ? " · not covering apps" : ""}`;
  return <>
    <Pressable testID="session-protection-control" disabled={!activeSurface} style={[s.control, statusOnly && s.status]} onPress={() => { if (activeSurface) setOpen(true); }} accessibilityRole="button" accessibilityLabel={`${label}. ${timer.hasOpenSession ? "Session protection details" : "Session protection settings"}`}>
      {statusOnly ? <Ionicons name={protectedNow ? "shield-checkmark-outline" : interrupted ? "shield-half-outline" : "shield-outline"} size={16} color={protectedNow ? colors.protection : colors.secondary} />
        : <View style={s.iconTile}><Ionicons name={protectedNow ? "shield-checkmark-outline" : interrupted ? "shield-half-outline" : "shield-outline"} size={17} color={interrupted ? colors.secondary : colors.protection} /></View>}
      {statusOnly || timer.hasOpenSession ? <>
        <Text style={[s.controlText, !statusOnly && s.rowText, protectedNow && { color: colors.protection }]}>{label}</Text>
        <Text style={s.link}>Details</Text>
      </> : <>
        <Text style={s.rowLabel}>Protection</Text>
        <Text style={s.rowValue} numberOfLines={1}>{label}</Text>
        <Ionicons name="chevron-forward" size={15} color={colors.tertiary} />
      </>}
    </Pressable>
    <ProtectionSettingsSheet visible={open && activeSurface} onClose={() => setOpen(false)} />
  </>;
}

export function ProtectionSettingsSheet({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const protection = useSessionProtection(), timer = useTimer(), { hapticsEnabled, profile } = useUser(), insets = useSafeAreaInsets();
  const [view, setView] = useState({ visible, ownerId: profile?.id });
  const [allowed, setAllowed] = useState<string[]>(protection.selection.allowed);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  // Once everything is allowed, permissions fold into one line so the app list comes first.
  const [showPermissions, setShowPermissions] = useState(false);
  const currentView = useRef(view);
  useLayoutEffect(() => { currentView.current = view; return () => { currentView.current = { visible: false, ownerId: "" }; }; }, [view]);
  const refresh = protection.refresh;
  // Both modes disclose the actual blockable inventory, only when opened.
  useEffect(() => { if (visible) void refresh(); }, [visible, refresh]);
  if (visible !== view.visible || profile?.id !== view.ownerId) {
    setView({ visible, ownerId: profile?.id });
    if (visible) { setAllowed(protection.selection.allowed); setMessage(""); setSaving(false); setShowPermissions(false); setEditing(false); }
  }
  const isCurrent = () => currentView.current === view && view.visible;
  const feedback = () => { if (hapticsEnabled) tapHaptic(); };
  const locked = !!timer.hasOpenSession;
  // A restored session can have a different saved binding from the preference
  // for the next session. Never substitute that preference into Details.
  const selection = locked ? protection.sessionSelection : { mode: "allow-list" as const, allowed };
  const permissionsReady = !!(protection.capabilities?.usage && protection.capabilities?.overlay && protection.capabilities?.notifications);
  const canRestore = locked && !!selection && selection.mode !== "normal" && !protection.active && protection.state.status !== "checking" && !timer.breakSecondsLeft;
  const applyDisabled = saving || protection.busy || !protection.loaded || !protection.supported || !permissionsReady || locked && !canRestore;
  const apply = async () => {
    if (applyDisabled || !isCurrent() || !selection) return;
    const expectedOwner = profile?.id, expectedView = currentView.current;
    setSaving(true); setMessage("");
    try {
      const saved = await protection.choose("allow-list", selection.mode === "allow-list" ? selection.allowed : []);
      if (currentView.current !== expectedView || !currentView.current.visible || currentView.current.ownerId !== expectedOwner) return;
      if (saved) onClose(); else setMessage("Your choice wasn’t saved. Check the permissions below and try again.");
    } catch { if (currentView.current === expectedView && currentView.current.visible && currentView.current.ownerId === expectedOwner) setMessage("Couldn’t save protection settings. End session is still available."); }
    finally { if (currentView.current === expectedView && currentView.current.visible && currentView.current.ownerId === expectedOwner) setSaving(false); }
  };
  const reviewNotifications = async () => {
    const expectedView = currentView.current;
    try {
      if (protection.capabilities?.notifications) await openNotificationSettings();
      else { const permission = await enableNotifications(); if (!permission.granted && permission.action === "settings") await openNotificationSettings(); }
      await protection.refresh();
    } catch { if (currentView.current === expectedView && isCurrent()) setMessage("Open this app’s notification settings to allow its protection notification."); }
  };
  return <AppSheet visible={visible} onRequestClose={() => { if (locked || !saving) onClose(); }} guardDismiss={!locked && saving} attached compact maxHeightRatio={0.88} label={locked ? "session protection details" : "session protection"} motionMode="timed"
    header={<SheetHeader title={locked ? "Your session protection" : "A little space to focus"} subtitle={locked ? "Your app choices stay fixed until this session ends. End session remains available at any time." : "During a session, only the apps you allow stay open. You get one break of up to five minutes."} onClose={() => { if (locked || !saving) onClose(); }} />}
    footer={<View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
      {(!locked || canRestore) && <SheetButton disabled={applyDisabled} onPress={() => void apply()} accessibilityRole="button" style={[s.primary, applyDisabled && s.disabled]}><Text style={s.primaryText}>{saving ? "Saving…" : canRestore ? "Restore protection" : "Save"}</Text></SheetButton>}
      {locked && <SheetButton onPress={onClose} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>Done</Text></SheetButton>}
    </View>}>
    <BottomSheetScrollView enableFooterMarginAdjustment contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled">
      {locked ? <View style={s.mode}>
        <Ionicons name="shield-checkmark-outline" size={21} color={colors.protection} />
        <View style={s.detail}><Text style={s.modeTitle}>{selection ? modeName(selection.mode) : "Checking this session’s app choices…"}</Text><Text style={s.caption}>{!selection ? "Reading the choices saved when this session started." : selection.mode === "normal" ? "This session started without app protection." : timer.breakSecondsLeft > 0 ? "On break. Protection returns automatically." : protection.state.status === "checking" ? "Checking protection on this phone. This does not stop the Android service. End session remains available." : protection.active ? "Active for this session" : "Protection is interrupted. Check permissions and restore it, or end your session."}</Text></View>
      </View> : null}
      {!protection.supported && <Text style={s.body}>Install the updated Android build to use protected sessions.</Text>}
      {protection.supported && permissionsReady && !locked && !showPermissions ? <SheetButton onPress={() => { feedback(); setShowPermissions(true); }} accessibilityRole="button" accessibilityLabel="Permissions ready on this phone. Review" style={s.ready}>
        <Ionicons name="checkmark-circle" size={18} color={colors.protection} /><Text style={[s.body, s.readyText]}>Permissions ready on this phone</Text><Text style={s.link}>Review</Text>
      </SheetButton> : protection.supported && <View style={s.permissions}>
        <View style={s.titleRow}><Text style={[s.modeTitle, s.flex]}>{locked || permissionsReady ? "Permissions on this phone" : "Allow protection on this phone"}</Text>
          {!locked && permissionsReady && <SheetButton onPress={() => { feedback(); setShowPermissions(false); }} accessibilityRole="button" accessibilityLabel="Hide permissions" style={s.permissionAction}><Text style={s.link}>Hide</Text></SheetButton>}</View>
        <Text style={s.caption}>Usage Access detects which app is open. Display over other apps lets this app cover the others. These choices stay on your phone.</Text>
        {([{kind:"usage", label:"Usage Access", granted:protection.capabilities?.usage}, {kind:"overlay", label:"Display over other apps", granted:protection.capabilities?.overlay}] as const).map(item => <View style={s.permissionRow} key={item.kind}><View style={s.detail}><Text style={s.body}>{item.label}</Text><Text style={s.caption}>{item.granted ? "Allowed" : "Needed for protected sessions"}</Text></View><SheetButton accessibilityRole="button" accessibilityLabel={(item.granted ? "Review" : "Allow") + " " + item.label} onPress={() => { if (isCurrent()) void protection.openPermission(item.kind); }} style={s.permissionAction}><Text style={s.link}>{item.granted ? "Review" : "Allow"}</Text></SheetButton></View>)}
        <View style={s.permissionRow}><View style={s.detail}><Text style={s.body}>Notifications</Text><Text style={s.caption}>{protection.capabilities?.notifications ? "Allowed · keeps End session reachable" : "Keeps End session reachable"}</Text></View><SheetButton accessibilityRole="button" accessibilityLabel={protection.capabilities?.notifications ? "Review protection notifications" : "Allow protection notifications"} onPress={() => { if (isCurrent()) void reviewNotifications(); }} style={s.permissionAction}><Text style={s.link}>{protection.capabilities?.notifications ? "Review" : "Allow"}</Text></SheetButton></View>
      </View>}
      {selection && selection.mode !== "normal" && protection.supported && <View style={s.permissions}>
        <View style={s.titleRow}>
          <Text style={[s.modeTitle, s.flex]}>{editing ? "Choose allowed apps" : `Allowed apps · ${selection.mode === "allow-list" ? selection.allowed.length : 0}`}</Text>
          {!locked && <SheetButton disabled={saving} onPress={() => { feedback(); setEditing(value => !value); if (!protection.apps.length) void refresh(); }} accessibilityRole="button"
            accessibilityLabel={editing ? "Done choosing apps" : "Edit allowed apps"} style={s.permissionAction}><Text style={s.link}>{editing ? "Done" : "Edit"}</Text></SheetButton>}
        </View>
        <Text style={s.caption}>{editing ? "Tick the apps that stay open. Everything else is covered during a session." : "Everything else is covered during a session, except during your break."}</Text>
        {editing && !protection.apps.length && <SheetButton onPress={() => { if (isCurrent()) void refresh(); }} accessibilityRole="button" style={s.permissionAction}><Text style={s.link}>Load apps on this phone</Text></SheetButton>}
        {(editing ? protection.apps : protection.apps.filter(app => selection.mode === "allow-list" && selection.allowed.includes(app.packageName))).map(app => {
          const selected = selection.mode === "allow-list" && selection.allowed.includes(app.packageName);
          const label = <View style={s.detail}><Text style={s.body}>{app.label}</Text></View>;
          return editing ? <SheetButton key={app.packageName} disabled={saving} onPress={() => { if (!isCurrent()) return; feedback(); setAllowed(current => current.includes(app.packageName) ? current.filter(value => value !== app.packageName) : current.length < 64 ? [...current, app.packageName] : current); }} accessibilityRole="checkbox" accessibilityState={{checked:selected,disabled:saving}} accessibilityLabel={app.label} style={s.permissionRow}>{label}<Ionicons name={selected ? "checkbox" : "square-outline"} size={21} color={selected ? colors.protection : colors.muted} /></SheetButton>
            : <View key={app.packageName} style={s.permissionRow}>{label}<Text style={[s.caption, { color: colors.protection }]}>Allowed</Text></View>;
        })}
        {!editing && selection.mode === "allow-list" && !selection.allowed.length && <Text style={s.caption}>No apps allowed yet. Tap Edit to keep tools like your notes or music open.</Text>}
        {selection.mode === "allow-list" && selection.allowed.length >= 64 && <Text style={s.caption}>You can keep up to 64 apps on your allow list.</Text>}
      </View>}
      <View style={s.safety}><Ionicons name="call-outline" size={16} color={colors.protection} /><View style={s.detail}><Text style={s.modeTitle}>Always open, can’t be blocked</Text><Text style={s.caption}>Phone and emergency calls, Settings, your Home screen and this app always stay open for your safety, along with system and permission screens. End session is always reachable.</Text></View></View>
      {!locked && <Text style={s.caption}>Choosing apps to block instead comes with the next app update.</Text>}
      {!!(message || protection.error) && <Text accessibilityRole="alert" style={s.error}>{message || protection.error}</Text>}
    </BottomSheetScrollView>
  </AppSheet>;
}
const s = StyleSheet.create({
  control:{minHeight:52,paddingVertical:11,flexDirection:"row",alignItems:"center",gap:12,paddingHorizontal:16}, status:{minHeight:48,paddingVertical:0,gap:8,alignSelf:"center",width:"100%",maxWidth:340,paddingHorizontal:14,borderRadius:16,backgroundColor:colors.surface}, iconTile:{width:30,height:30,borderRadius:9,alignItems:"center",justifyContent:"center",backgroundColor:"rgba(99,230,190,0.14)"}, rowLabel:{color:colors.text,fontSize: 16, lineHeight: 22,fontWeight:"500"}, rowValue:{flex:1,textAlign:"right",color:colors.secondary,fontSize: 16, lineHeight: 22}, rowText:{fontSize: 16, lineHeight: 22,fontWeight:"500"},controlText:{flex:1,color:colors.secondary,fontSize: 13, lineHeight: 18},link:{color:colors.accent,fontSize:14,fontWeight:"500"},
  sheetHeading:{paddingHorizontal:20,paddingBottom:12,gap:6},sheetTitle:{fontSize: 24, lineHeight: 30,fontWeight:"600",color:colors.text,letterSpacing:-0.5},body:{fontSize: 15, lineHeight: 20,color:colors.secondary},caption:{fontSize: 13, lineHeight: 18,color:colors.secondary},sheetBody:{paddingHorizontal:16,paddingBottom:20,gap:14},modes:{gap:8},ready:{ ...edge,flexDirection:"row",alignItems:"center",gap:10,minHeight:48,paddingHorizontal:14,borderRadius:14,backgroundColor:colors.sheetCard},readyText:{flex:1,color:colors.text},
  mode:{ ...edge,flexDirection:"row",alignItems:"center",gap:12,padding:15,minHeight:78,borderRadius:18,backgroundColor:colors.sheetCard,borderWidth:1,borderColor:"transparent"},modeSelected:{backgroundColor:"rgba(99,230,190,0.08)",borderColor:colors.protection},modeTitle:{fontSize: 16, lineHeight: 22,fontWeight:"600",color:colors.text},detail:{flex:1,minWidth:0,gap:3},safety:{flexDirection:"row",gap:10,padding:14,borderRadius:16,backgroundColor:"rgba(99,230,190,0.08)"},titleRow:{flexDirection:"row",alignItems:"center",gap:8},flex:{flex:1,minWidth:0},permissions:{gap:8,paddingTop:8},permissionRow:{flexDirection:"row",alignItems:"center",gap:10,minHeight:52,paddingVertical:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.line},permissionAction:{minHeight:44,minWidth:52,alignItems:"center",justifyContent:"center"},
  footer:{gap:10,paddingHorizontal:20,paddingTop:12,backgroundColor:colors.surfaceRaised},primary:{minHeight:54,padding:14,borderRadius:27,backgroundColor:colors.primary,alignItems:"center",justifyContent:"center"},primaryText:{color:colors.primaryText,fontSize: 17, lineHeight: 22,fontWeight:"600"},disabled:{opacity:0.45},error:{fontSize: 14, lineHeight: 20,color:colors.danger},
});
