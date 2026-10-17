import { useEffect, useRef, useState } from "react";
import { Animated, AppState, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../constants/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { Text } from "./AppText";
import type { DailyAchievementDisplay } from "../services/dailyEffortCelebrationService";

/** A finite achievement reveal, presented after the session result is dismissed. */
export default function DailyEffortCelebration({firstSession = true, dailyGoal = false}: Partial<DailyAchievementDisplay>) {
  const reduced = useReducedMotion();
  const [entrance] = useState(() => new Animated.Value(1));
  const played = useRef(false);
  useEffect(() => {
    if (reduced || played.current || (AppState.currentState && AppState.currentState !== "active")) { entrance.setValue(1); return; }
    played.current = true;
    entrance.setValue(0);
    const animation = Animated.timing(entrance, {toValue:1, duration:720, useNativeDriver:true, isInteraction:false});
    animation.start();
    const app = AppState.addEventListener("change", state => {
      if (state !== "active") { animation.stop(); entrance.setValue(1); }
    });
    return () => { app.remove(); animation.stop(); };
  }, [entrance, reduced]);
  const highlight = dailyGoal ? colors.success : colors.accent;
  const announcement = [dailyGoal ? "Daily goal complete." : "A good start to your day.", firstSession ? "Your first session today is complete." : "", dailyGoal ? "You reached the time you set aside for today." : ""].filter(Boolean).join(" ");
  return <Animated.View testID="daily-achievement-celebration" accessible accessibilityLiveRegion="polite"
    accessibilityLabel={announcement}
    style={[s.scene, {opacity:entrance, transform:[{translateY:entrance.interpolate({inputRange:[0,1], outputRange:[18,0]})}]}]}>
    <View style={s.hero} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[s.halo, {borderColor:highlight + "28", transform:[{scale:entrance.interpolate({inputRange:[0,0.75,1], outputRange:[0.76,1.04,1]})}]}]} />
      <Animated.View style={[s.ring, {borderColor:highlight + "80", backgroundColor:highlight + "12", transform:[{scale:entrance.interpolate({inputRange:[0,0.72,1], outputRange:[0.7,1.06,1]})}]}]}>
        <View style={[s.icon, {backgroundColor:highlight + "18"}]}><Ionicons name={dailyGoal ? "flag-outline" : "sunny-outline"} size={66} color={highlight} /></View>
      </Animated.View>
      <Animated.View style={[s.sparkle, s.sparkleLeft, {opacity:entrance, transform:[{translateY:entrance.interpolate({inputRange:[0,1], outputRange:[14,0]})}, {rotate:entrance.interpolate({inputRange:[0,1], outputRange:["-16deg","0deg"]})}]}]}><Ionicons name="sparkles" size={26} color={highlight} /></Animated.View>
      <Animated.View style={[s.sparkle, s.sparkleRight, {opacity:entrance, transform:[{translateY:entrance.interpolate({inputRange:[0,1], outputRange:[18,0]})}]}]}><Ionicons name="sparkles-outline" size={19} color={highlight} /></Animated.View>
      <View style={[s.dot, s.dotTop, {backgroundColor:highlight}]} /><View style={[s.dot, s.dotBottom, {backgroundColor:highlight + "70"}]} />
    </View>
    <View style={s.copy} testID={dailyGoal ? "daily-goal-achievement" : firstSession ? "first-daily-effort" : undefined}>
      <Text style={[s.eyebrow, {color:highlight}]}>{dailyGoal ? "DAILY GOAL COMPLETE" : "FIRST SESSION TODAY"}</Text>
      <Text style={s.title}>{dailyGoal ? "Today’s goal, done." : "A good start."}</Text>
      <Text style={s.body}>{dailyGoal ? "You reached the time you set aside for today. Every session helped you get here." : "Your first session today is complete. One step forward for something that matters to you."}</Text>
    </View>
    {dailyGoal && firstSession && <View style={s.firstSessionNote} testID="first-daily-effort"><Ionicons name="checkmark-circle-outline" size={19} color={colors.accent} /><Text style={s.firstSessionCopy}>Your first session today, too.</Text></View>}
  </Animated.View>;
}

const s = StyleSheet.create({
  scene:{width:"100%", alignItems:"center", gap:28, paddingVertical:20},
  hero:{width:252, height:252, alignItems:"center", justifyContent:"center"},
  halo:{position:"absolute", width:244, height:244, borderRadius:122, borderWidth:1},
  ring:{width:198, height:198, borderRadius:99, borderWidth:2, alignItems:"center", justifyContent:"center"},
  icon:{width:136, height:136, borderRadius:68, alignItems:"center", justifyContent:"center"},
  sparkle:{position:"absolute"}, sparkleLeft:{left:4, top:45}, sparkleRight:{right:2, bottom:45},
  dot:{position:"absolute", width:5, height:5, borderRadius:3}, dotTop:{right:40, top:18}, dotBottom:{left:35, bottom:25},
  copy:{width:"100%", maxWidth:360, alignItems:"center", gap:14},
  eyebrow:{fontSize: 12, lineHeight: 16, fontWeight:"600", letterSpacing:1.6, textAlign:"center"},
  title:{fontSize:32, lineHeight:39, fontWeight:"600", letterSpacing:-0.9, color:colors.text, textAlign:"center"},
  body:{fontSize: 16, lineHeight: 22, color:colors.secondary, textAlign:"center", maxWidth:320},
  firstSessionNote:{flexDirection:"row", alignItems:"center", gap:8, paddingHorizontal:14, paddingVertical:10, borderRadius:16, backgroundColor:colors.accentSoft},
  firstSessionCopy:{color:colors.neutral, fontSize: 14, lineHeight: 20, flexShrink:1},
});
