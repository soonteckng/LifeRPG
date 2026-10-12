import { useEffect, useRef, useState } from "react";
import { Animated, AppState, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../constants/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { Text } from "./AppText";
import type { DailyAchievementDisplay } from "../services/dailyEffortCelebrationService";

/** One clear celebration inside the result card, with the same Done action. */
export default function DailyEffortCelebration({firstSession = true, dailyGoal = false}: Partial<DailyAchievementDisplay>) {
  const reduced = useReducedMotion();
  const [entrance] = useState(() => new Animated.Value(1));
  const played = useRef(false);
  useEffect(() => {
    if (reduced || played.current || (AppState.currentState && AppState.currentState !== "active")) { entrance.setValue(1); return; }
    played.current = true;
    entrance.setValue(0);
    const animation = Animated.timing(entrance, {toValue:1, duration:520, useNativeDriver:true, isInteraction:false});
    animation.start();
    const app = AppState.addEventListener("change", state => {
      if (state !== "active") { animation.stop(); entrance.setValue(1); }
    });
    return () => { app.remove(); animation.stop(); };
  }, [entrance, reduced]);
  const announcement = ["Nice work!", firstSession ? "Your first session today is complete." : "", dailyGoal ? "You reached your daily goal." : ""].filter(Boolean).join(" ");
  return <Animated.View testID="daily-achievement-celebration" accessible accessibilityLiveRegion="polite"
    accessibilityLabel={announcement}
    style={[s.card, {opacity:entrance, transform:[{translateY:entrance.interpolate({inputRange:[0,1], outputRange:[6,0]})}]}]}>
    <View style={s.heading}>
      <Animated.View style={[s.icon, {transform:[{scale:entrance.interpolate({inputRange:[0,0.7,1], outputRange:[0.8,1.06,1]})}]}]}>
        <Ionicons name="sparkles-outline" size={26} color={colors.accent} />
      </Animated.View>
      <Text style={s.title}>Nice work!</Text>
    </View>
    {firstSession && <View style={s.achievement} testID="first-daily-effort">
      <View style={s.marker}><Ionicons name="checkmark" size={18} color={colors.success} /></View>
      <View style={s.copy}><Text style={s.label}>Your first session today</Text><Text style={s.body}>One step forward for something that matters.</Text></View>
    </View>}
    {dailyGoal && <View style={s.achievement} testID="daily-goal-achievement">
      <View style={s.marker}><Ionicons name="flag-outline" size={18} color={colors.success} /></View>
      <View style={s.copy}><Text style={s.label}>Daily goal complete</Text><Text style={s.body}>You made the time you set aside for today.</Text></View>
    </View>}
  </Animated.View>;
}

const s = StyleSheet.create({
  card:{gap:14, padding:18, borderRadius:22, backgroundColor:colors.accentSoft, borderWidth:StyleSheet.hairlineWidth, borderColor:colors.accent + "50"},
  heading:{flexDirection:"row", alignItems:"center", gap:12},
  icon:{width:44, height:44, borderRadius:14, backgroundColor:colors.accent + "16", alignItems:"center", justifyContent:"center"},
  title:{fontSize:24, lineHeight:30, fontWeight:"600", letterSpacing:-0.6, color:colors.text, flexShrink:1},
  achievement:{flexDirection:"row", alignItems:"flex-start", gap:10},
  marker:{width:26, height:26, alignItems:"center", justifyContent:"center"},
  copy:{flex:1, minWidth:0, gap:4},
  label:{fontSize:17, lineHeight:23, fontWeight:"500", color:colors.success},
  body:{fontSize:14, lineHeight:20, color:colors.secondary},
});
