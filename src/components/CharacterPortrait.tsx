import { StyleSheet, Text, View } from "react-native";
import { colors } from "../constants/theme";

// Code-native artwork scales with earned Strength. Other attributes add orbit
// accents. This is an effort avatar, not a measurement of someone's real body.
export default function CharacterPortrait({
  avatar,
  strength = 1,
  developed = 0,
}: {
  avatar: string;
  strength?: number;
  developed?: number;
}) {
  const growth = Math.min(14, Math.max(0, strength - 1) * 2);
  return (
    <View
      style={s.stage}
      accessible
      accessibilityLabel={`Your character. Strength level ${strength}. ${developed} attributes developed.`}
    >
      <View style={s.orbit} />
      <View style={s.innerOrbit} />
      {developed > 0 && (
        <View style={s.star}>
          <Text style={s.starText}>✦</Text>
        </View>
      )}
      <View style={s.floor} />
      <View style={[s.arm, s.leftArm, { width: 22 + growth / 2 }]} />
      <View style={[s.arm, s.rightArm, { width: 22 + growth / 2 }]} />
      <View
        style={[s.body, { width: 70 + growth, marginLeft: -(70 + growth) / 2 }]}
      >
        <View style={s.chestMark} />
      </View>
      <View style={s.head}>
        <View style={s.face} />
      </View>
      <View style={[s.leg, { left: "50%", marginLeft: -27 }]} />
      <View style={[s.leg, { left: "50%", marginLeft: 6 }]} />
      <View style={s.badge}>
        <Text style={s.badgeText}>{avatar}</Text>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  stage: {
    height: 220,
    width: "100%",
    position: "relative",
    alignItems: "center",
  },
  orbit: {
    position: "absolute",
    width: 204,
    height: 204,
    borderRadius: 102,
    borderWidth: 1,
    borderColor: "rgba(165,180,252,0.15)",
    top: 0,
  },
  innerOrbit: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(165,180,252,0.045)",
    top: 22,
  },
  floor: {
    position: "absolute",
    top: 190,
    width: 116,
    height: 13,
    borderRadius: 60,
    backgroundColor: "rgba(165,180,252,0.12)",
  },
  head: {
    position: "absolute",
    top: 28,
    width: 47,
    height: 52,
    borderRadius: 23,
    backgroundColor: "#CED7FF",
    borderWidth: 3,
    borderColor: "#A5B4FC",
    alignItems: "center",
    justifyContent: "center",
  },
  face: {
    width: 25,
    height: 13,
    borderRadius: 7,
    backgroundColor: "#626AB1",
    marginTop: 4,
  },
  body: {
    position: "absolute",
    left: "50%",
    top: 83,
    height: 74,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    backgroundColor: "#909AD7",
    borderWidth: 2,
    borderColor: "#B9C5F5",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  chestMark: {
    width: 18,
    height: 18,
    borderRadius: 6,
    transform: [{ rotate: "45deg" }],
    backgroundColor: "#DDE3FF",
  },
  arm: {
    position: "absolute",
    top: 91,
    height: 65,
    borderRadius: 13,
    backgroundColor: "#737FB9",
  },
  leftArm: { left: "50%", marginLeft: -54, transform: [{ rotate: "12deg" }] },
  rightArm: { left: "50%", marginLeft: 30, transform: [{ rotate: "-12deg" }] },
  leg: {
    position: "absolute",
    top: 148,
    width: 22,
    height: 47,
    borderRadius: 9,
    backgroundColor: "#737FB9",
  },
  badge: {
    position: "absolute",
    right: 12,
    bottom: 22,
    width: 45,
    height: 45,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 25 },
  star: { position: "absolute", top: 12, right: 32 },
  starText: { color: colors.accent, fontSize: 22 },
});
