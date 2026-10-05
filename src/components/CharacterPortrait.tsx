import { Text } from "./AppText";
import { useEffect, useState } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { characterAccent } from "../utils/characterAppearance";
import { colors } from "../constants/theme";

// A lightweight character foundation. Growth reflects saved overall effort;
// waving is cosmetic and never creates XP or changes a session.
export default function CharacterPortrait({
  avatar,
  level = 1,
  developed = 0,
  size = 176,
}: {
  avatar: string;
  level?: number;
  developed?: number;
  size?: number;
}) {
  const accent = characterAccent(avatar);
  const growth = Math.min(14, Math.max(0, level - 1) * 2);
  const reduced = useReducedMotion();
  const [wave] = useState(() => new Animated.Value(0));
  const [expression, setExpression] = useState(0);
  useEffect(() => () => wave.stopAnimation(), [wave]);
  const greet = () => {
    setExpression(value => (value + 1) % 3);
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
      style={({ pressed }) => [s.stage, { width: size, height: size }, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      onPress={greet}
      accessibilityLabel={`Your character. Level ${level}. ${developed} Life areas developed.`}
      accessibilityHint="Tap to greet your character and change its expression."
    >
      <View testID="character-canvas" style={{ width: 220, height: 220, alignItems: "center", position: "absolute", top: (size - 220) / 2, left: (size - 220) / 2, transform: [{ scale: size / 220 }] }}>
      <View style={s.orbit} />
      {developed > 0 && (
        <View style={s.star}>
          <Text style={s.starText}>✦</Text>
        </View>
      )}
      <View style={[s.arm, s.leftArm, { width: 28 + growth / 2 }]} />
      <Animated.View
        style={[
          s.arm,
          s.rightArm,
          {
            width: 28 + growth / 2,
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
        style={[s.body, { width: 94 + growth, marginLeft: -(94 + growth) / 2 }]}
      >
      </View>
      <Animated.View style={[s.head, { transform: [{ rotate: reduced ? "0deg" : wave.interpolate({ inputRange: [0, 0.5, 1], outputRange: ["0deg", "8deg", "0deg"] }) }] }]}>
        <View style={s.glasses}><View style={s.lens} /><View style={s.bridge} /><View style={s.lens} /></View>
        <View style={[s.smile, expression === 1 && { width: 22, height: 9, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }, expression === 2 && { width: 10, height: 10, borderRadius: 5 }]} />
      </Animated.View>
      <View style={[s.scarf, { backgroundColor: accent }]} />
      </View>
    </Pressable>
  );
}
const s = StyleSheet.create({
  stage: {
    height: 112,
    width: 112,
    alignSelf: "center",
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
    top: 8,
    left: 8,
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
    top: 30,
    left: 70,
    width: 80,
    height: 86,
    borderRadius: 40,
    backgroundColor: "#CED7FF",
    borderWidth: 3,
    borderColor: "#A5B4FC",
    alignItems: "center",
    justifyContent: "center",
  },
  glasses: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  lens: { width: 24, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#626AB1" },
  bridge: { width: 6, height: 3, backgroundColor: "#626AB1" },
  smile: { marginTop: 8, width: 16, height: 4, borderRadius: 2, backgroundColor: "#626AB1" },
  scarf: { position: "absolute", top: 110, left: 58, width: 104, height: 20, borderRadius: 8, backgroundColor: "#38C9B3", zIndex: 3 },
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
    top: 124,
    height: 68,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    backgroundColor: "#929BC7",
    borderWidth: 2,
    borderColor: "#ADB7DF",
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
    top: 136,
    height: 54,
    borderRadius: 13,
    backgroundColor: "#737FB9",
  },
  leftArm: { left: "50%", marginLeft: -70, transform: [{ rotate: "12deg" }] },
  rightArm: { left: "50%", marginLeft: 42, transform: [{ rotate: "-12deg" }] },
  leg: {
    position: "absolute",
    top: 148,
    width: 22,
    height: 47,
    borderRadius: 9,
    backgroundColor: "#737FB9",
  },
  star: { position: "absolute", top: 12, right: 32 },
  starText: { color: colors.accent, fontSize: 22 },
});
