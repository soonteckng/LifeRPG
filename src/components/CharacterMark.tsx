import { characterAccent } from "../utils/characterAppearance";
import { StyleSheet, View } from "react-native";

// The same portrait palette at a compact scale for Home's identity row.
export default function CharacterMark({ size = 52, avatar = "🌱" }: { size?: number; avatar?: string }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2 }} importantForAccessibility="no-hide-descendants"><View style={[s.stage, { transform: [{ scale: size / 64 }], marginTop: (size - 64) / 2, marginLeft: (size - 64) / 2 }]}>
    <View style={s.body} /><View style={s.head} /><View style={[s.scarf, { backgroundColor: characterAccent(avatar) }]} />
    <View style={[s.eye, { left: 23 }]} /><View style={[s.eye, { right: 23 }]} />
  </View></View>;
}
const s = StyleSheet.create({
  stage: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#1B1E2D", overflow: "hidden" },
  head: { position: "absolute", top: 9, left: 21, width: 23, height: 25, borderRadius: 13, backgroundColor: "#CFD5FF", borderWidth: 2, borderColor: "#A5B4FC" },
  body: { position: "absolute", top: 34, left: 14, width: 37, height: 31, borderRadius: 14, backgroundColor: "#959BD5" },
  scarf: { position: "absolute", top: 33, left: 15, width: 35, height: 7, borderRadius: 4, backgroundColor: "#38C9B3" },
  eye: { position: "absolute", top: 20, width: 8, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: "#626AB1" },
});
