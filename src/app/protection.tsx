import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PersonalPage, PersonalButton, p } from "../components/PersonalUI";
import { Text } from "../components/AppText";
import { ProtectionSettingsSheet } from "../components/SessionProtectionControl";
import { useSessionProtection } from "../context/SessionProtectionContext";
import { useState } from "react";
import { colors } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { useTimer } from "../context/TimerContext";

export default function ProtectionScreen() {
  const protection = useSessionProtection();
  const timer = useTimer({ live: false });
  const [open, setOpen] = useState(false);
  const online = useAuth().accessMode === "online";
  if (!online && open) setOpen(false);
  const selection = timer.hasOpenSession ? protection.sessionSelection : protection.selection;
  const mode = !selection ? "Checking your session…" : selection.mode === "normal" ? "Set up protection" : selection.mode === "allow-list" ? "Allow list" : "Block apps";
  return <PersonalPage title="Session protection" subtitle="Give your next session a little space." back animateTransition>
    <View style={[p.card, { backgroundColor: colors.focusSurface, gap: 14 }]}>
      <View style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "rgba(45,212,167,0.1)" }}><Ionicons name="shield-checkmark-outline" size={25} color={colors.protection} /></View>
      <Text style={p.rowTitle}>{mode}</Text><Text style={p.body}>New sessions protect your time by covering distracting apps. Choose the tools you need, with one break of up to five minutes. Your app choices stay on this phone.</Text>
      <PersonalButton title={timer.hasOpenSession ? "Protection details" : "Choose protection"} onPress={() => setOpen(true)} />
    </View>
    <View style={{ gap: 12 }}><Text style={p.rowTitle}>You stay in control</Text><Text style={p.body}>Calls, emergency access, your Home screen, Settings and LifeRPG stay available. Choose your mode before starting; it stays fixed for that session. You can End a session at any time.</Text><Text style={p.body}>Protection uses Usage Access and Display over other apps. Routine reminders only need notification permission.</Text></View>
    {!!protection.error && <Text style={p.error} accessibilityRole="alert">{protection.error}</Text>}
    <ProtectionSettingsSheet visible={open && online} onClose={() => setOpen(false)} />
  </PersonalPage>;
}
