import { useEffect, useState } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../constants/theme";

// A lightweight character foundation. Growth reflects saved overall effort;
// waving is cosmetic and never creates XP or changes a session.
export default function CharacterPortrait({
  avatar,
  level = 1,
  developed = 0,
}: {
  avatar: string;
  level?: number;
  developed?: number;
}) {
  const growth = Math.min(14, Math.max(0, level - 1) * 2);
  const reduced = useReducedMotion();
  const [wave] = useState(() => new Animated.Value(0));
  useEffect(() => () => wave.stopAnimation(), [wave]);
  const greet = () => {
    if (reduced) return;
    wave.stopAnimation();
    wave.setValue(0);
    Animated.timing(wave, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start();
  };
  return (
    <Pressable
      style={({ pressed }) => [s.stage, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      onPress={greet}
      accessibilityLabel={`Your character. Level ${level}. ${developed} Life areas developed.`}
      accessibilityHint="Tap to wave. This does not change your progress."
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
      <Animated.View
        style={[
          s.arm,
          s.rightArm,
          {
            width: 22 + growth / 2,
            transform: [
              {
                rotate: reduced
                  ? "-12deg"
                  : wave.interpolate({
                      inputRange: [0, 0.25, 0.5, 0.75, 1],
                      outputRange: [
                        "-12deg",
                        "-65deg",
                        "-35deg",
                        "-65deg",
                        "-12deg",
                      ],
                    }),
              },
            ],
          },
        ]}
      />
      <View
        style={[s.body, { width: 70 + growth, marginLeft: -(70 + growth) / 2 }]}
      >
        <View style={s.chestMark} />
      </View>
      <View style={s.head}>
        <View style={s.glasses}><View style={s.lens} /><View style={s.bridge} /><View style={s.lens} /></View>
        <View style={s.smile} />
      </View>
      <View style={s.scarf} />
      <View style={[s.leg, { left: "50%", marginLeft: -27 }]} />
      <View style={[s.leg, { left: "50%", marginLeft: 6 }]} />
      <View style={s.badge}>
        <Text style={s.badgeText}>{avatar}</Text>
      </View>
    </Pressable>
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
    borderWidth: 0,
    backgroundColor: "#191D2B",
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
  glasses: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  lens: { width: 13, height: 12, borderRadius: 6, borderWidth: 2, borderColor: "#626AB1" },
  bridge: { width: 4, height: 2, backgroundColor: "#626AB1" },
  smile: { marginTop: 5, width: 9, height: 3, borderRadius: 2, backgroundColor: "#626AB1" },
  scarf: { position: "absolute", top: 80, width: 80, height: 13, borderRadius: 8, backgroundColor: "#38C9B3", zIndex: 3 },
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
