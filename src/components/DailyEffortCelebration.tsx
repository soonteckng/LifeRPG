import { useEffect, useRef, useState } from "react";
import { Animated, AppState, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../constants/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { Text } from "./AppText";

/** One quiet entrance inside the result card, with the same Done action. */
export default function DailyEffortCelebration() {
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
  return <Animated.View testID="first-daily-effort" accessible accessibilityLiveRegion="polite"
    accessibilityLabel="First step today. You showed up for something that matters."
    style={[s.card, {opacity:entrance, transform:[{translateY:entrance.interpolate({inputRange:[0,1], outputRange:[6,0]})}]}]}>
    <Animated.View style={[s.icon, {transform:[{scale:entrance.interpolate({inputRange:[0,0.7,1], outputRange:[0.8,1.06,1]})}]}]}>
      <Ionicons name="sparkles-outline" size={26} color={colors.success} />
    </Animated.View>
    <View style={s.copy}><Text style={s.title}>First step today</Text><Text style={s.body}>You showed up for something that matters.</Text></View>
  </Animated.View>;
}

const s = StyleSheet.create({
  card:{flexDirection:"row", alignItems:"center", gap:12, padding:14, borderRadius:18, backgroundColor:colors.success + "12", borderWidth:StyleSheet.hairlineWidth, borderColor:colors.success + "35"},
  icon:{width:44, height:44, alignItems:"center", justifyContent:"center"},
  copy:{flex:1, minWidth:0, gap:4},
  title:{fontSize:17, lineHeight:23, fontWeight:"500", color:colors.success},
  body:{fontSize:14, lineHeight:20, color:colors.secondary},
});
