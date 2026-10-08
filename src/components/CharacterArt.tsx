import { memo, type ComponentProps } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { characterLook } from "../utils/characterAppearance";
type AnimatedViewStyle = ComponentProps<typeof Animated.View>["style"];

// One scalable drawing powers Profile, the editor thumbnails and Home.
export default memo(function CharacterArt({ avatar, size, bodyStyle, eyeStyle, armStyle, expression = 0 }: {
  avatar: string; size: number; bodyStyle?: AnimatedViewStyle; eyeStyle?: AnimatedViewStyle; armStyle?: AnimatedViewStyle; expression?: number;
}) {
  const look = characterLook(avatar), robot = look.accessory === "antenna";
  return <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants">
    <View testID="character-canvas" style={{ width: 220, height: 220, position: "absolute", top: (size - 220) / 2, left: (size - 220) / 2, transform: [{ scale: size / 220 }] }}>
      <View style={[s.orbit, { backgroundColor: look.accent + "0D" }]} />
      <View style={[s.shadow, { backgroundColor: look.body + "20" }]} />
      <Animated.View style={[s.figure, bodyStyle]}>
        <View testID="character-left-arm" style={[s.arm, s.leftArm, { backgroundColor: look.shade }]} />
        <Animated.View testID="character-right-arm" style={[s.arm, s.rightArm, { backgroundColor: look.shade }, armStyle]} />
        <View style={[s.foot, { left: 77, backgroundColor: look.shade }]} /><View style={[s.foot, { left: 122, backgroundColor: look.shade }]} />
        <View testID="character-body" style={[s.body, { backgroundColor: look.body, borderColor: look.head + "70" }]}>
          <View style={[s.chest, { backgroundColor: look.accent }]} />
        </View>
        <View testID="character-head" style={[s.head, { backgroundColor: look.head, borderColor: look.body, borderRadius: robot ? 24 : 40 }]}>
          <Animated.View testID="character-eyes" style={[s.eyes, eyeStyle]}><View style={[s.eye, { backgroundColor: look.ink }]} /><View style={[s.eye, { backgroundColor: look.ink }]} /></Animated.View>
          <View style={[s.cheek, { left: 12, backgroundColor: look.accent + "65" }]} /><View style={[s.cheek, { right: 12, backgroundColor: look.accent + "65" }]} />
          <View style={[s.smile, { borderColor: look.ink }, expression === 1 && s.wideSmile, expression === 2 && s.roundSmile]} />
        </View>
        <View testID="character-scarf" style={[s.scarf, { backgroundColor: look.accent }]} />
        {look.accessory === "cap" && <><View style={[s.cap, { borderBottomColor: look.shade }]} /><View style={[s.capBrim, { backgroundColor: look.shade }]} /><View style={[s.spark, { backgroundColor: look.accent }]} /></>}
        {(look.accessory === "sprout" || look.accessory === "leaves") && <><View style={[s.stem, { backgroundColor: look.shade }]} /><View style={[s.leaf, s.leafLeft, { backgroundColor: look.accent }]} /><View style={[s.leaf, s.leafRight, { backgroundColor: look.body }]} /></>}
        {look.accessory === "band" && <View style={[s.band, { backgroundColor: look.shade }]} />}
        {look.accessory === "headphones" && <><View style={[s.headphoneBand, { borderColor: look.shade }]} /><View style={[s.earpiece, { left: 61, backgroundColor: look.body }]} /><View style={[s.earpiece, { right: 61, backgroundColor: look.body }]} /></>}
        {look.accessory === "beret" && <><View style={[s.beret, { backgroundColor: look.shade }]} /><View style={[s.beretStem, { backgroundColor: look.shade }]} /></>}
        {look.accessory === "hood" && <View style={[s.mask, { backgroundColor: look.shade }]} />}
        {robot && <><View style={[s.antenna, { backgroundColor: look.shade }]} /><View style={[s.signal, { backgroundColor: look.accent }]} /><View style={[s.robotEar, { left: 60, backgroundColor: look.body }]} /><View style={[s.robotEar, { right: 60, backgroundColor: look.body }]} /></>}
        {look.accessory === "star" && <View style={[s.star, { backgroundColor: look.head }]} />}
        {look.accessory === "ears" && <><View style={[s.catEar, { left: 73, borderBottomColor: look.body, transform: [{ rotate: "-15deg" }] }]} /><View style={[s.catEar, { right: 73, borderBottomColor: look.body, transform: [{ rotate: "15deg" }] }]} /><View style={[s.whisker, { left: 66, backgroundColor: look.ink }]} /><View style={[s.whisker, { right: 66, backgroundColor: look.ink }]} /></>}
      </Animated.View>
    </View>
  </View>;
});
const s = StyleSheet.create({
  orbit: { position: "absolute", width: 202, height: 202, borderRadius: 101, left: 9, top: 7 }, shadow: { position: "absolute", width: 98, height: 10, borderRadius: 49, left: 61, top: 199 },
  figure: { position: "absolute", width: 220, height: 220 }, head: { position: "absolute", top: 44, left: 70, width: 80, height: 82, borderRadius: 40, borderWidth: 2.5 },
  body: { position: "absolute", top: 129, left: 64, width: 92, height: 61, borderRadius: 29, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  chest: { width: 16, height: 16, borderRadius: 5, opacity: 0.8 }, arm: { position: "absolute", top: 139, width: 25, height: 48, borderRadius: 13 }, leftArm: { left: 44, transform: [{ rotate: "12deg" }] }, rightArm: { left: 151, transform: [{ rotate: "-12deg" }] },
  foot: { position: "absolute", top: 181, width: 21, height: 19, borderRadius: 8 }, scarf: { position: "absolute", left: 58, top: 119, width: 104, height: 18, borderRadius: 8 },
  eyes: { position: "absolute", left: 21, top: 31, flexDirection: "row", gap: 17 }, eye: { width: 7, height: 10, borderRadius: 4 },
  cheek: { position: "absolute", top: 48, width: 12, height: 6, borderRadius: 4 }, smile: { position: "absolute", left: 32, top: 52, width: 12, height: 7, borderBottomWidth: 2, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  wideSmile: { left: 28, width: 20, height: 9 }, roundSmile: { left: 33, width: 9, height: 9, borderWidth: 2, borderRadius: 5 },
  cap: { position: "absolute", left: 67, top: 4, width: 0, height: 0, borderLeftWidth: 38, borderRightWidth: 25, borderBottomWidth: 48, borderLeftColor: "transparent", borderRightColor: "transparent" }, capBrim: { position: "absolute", left: 61, top: 45, width: 95, height: 12, borderRadius: 8 }, spark: { position: "absolute", top: 30, left: 103, width: 9, height: 9, transform: [{ rotate: "45deg" }], borderRadius: 2 },
  stem: { position: "absolute", left: 108, top: 28, width: 5, height: 21, borderRadius: 3 }, leaf: { position: "absolute", width: 29, height: 15, borderTopLeftRadius: 20, borderBottomRightRadius: 20 }, leafLeft: { left: 82, top: 22, transform: [{ rotate: "25deg" }] }, leafRight: { left: 109, top: 17, transform: [{ rotate: "-20deg" }] },
  band: { position: "absolute", left: 72, top: 61, width: 76, height: 10, borderRadius: 5 }, headphoneBand: { position: "absolute", left: 63, top: 38, width: 94, height: 74, borderRadius: 44, borderWidth: 6, borderBottomColor: "transparent" }, earpiece: { position: "absolute", top: 75, width: 15, height: 29, borderRadius: 7 },
  beret: { position: "absolute", top: 30, left: 63, width: 91, height: 30, borderRadius: 22, transform: [{ rotate: "-8deg" }] }, beretStem: { position: "absolute", top: 23, left: 108, width: 7, height: 15, borderRadius: 4 },
  mask: { position: "absolute", top: 92, left: 72, width: 76, height: 32, borderRadius: 16 }, antenna: { position: "absolute", top: 22, left: 107, width: 6, height: 27, borderRadius: 3 }, signal: { position: "absolute", top: 16, left: 102, width: 16, height: 16, borderRadius: 8 }, robotEar: { position: "absolute", top: 72, width: 12, height: 23, borderRadius: 5 },
  star: { position: "absolute", top: 149, left: 101, width: 18, height: 18, borderRadius: 3, transform: [{ rotate: "45deg" }] }, catEar: { position: "absolute", top: 24, width: 0, height: 0, borderLeftWidth: 12, borderRightWidth: 12, borderBottomWidth: 28, borderLeftColor: "transparent", borderRightColor: "transparent" }, whisker: { position: "absolute", top: 95, width: 16, height: 2, borderRadius: 1 },
});
