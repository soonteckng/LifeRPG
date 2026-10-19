import { useMemo, useState, type ReactNode } from "react";
import { Animated as Native, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

/** A second-level page that follows a rightward drag from anywhere on it and
 * leaves when released far or fast enough, like iOS. Vertical scrolling wins
 * when the drag starts vertically. Runs on the UI thread; JS is only called
 * once the page has left. */
export default function SwipeBack({ enabled, onBack, offset: shared, children }: { enabled: boolean; onBack: () => void; offset?: SharedValue<number>; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const own = useSharedValue(0), offset = shared ?? own;
  const pan = useMemo(() => Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX(16)
    .failOffsetY([-14, 14])
    .onUpdate(event => { offset.set(Math.max(0, event.translationX)); })
    .onEnd(event => {
      const leave = event.translationX > width * 0.33 || (event.velocityX > 700 && event.translationX > 24);
      offset.set(withTiming(leave ? width : 0, { duration: leave ? 180 : 220, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System },
        finished => { if (finished && leave) runOnJS(onBack)(); }));
    }), [enabled, offset, onBack, width]);
  const follow = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));
  return <GestureDetector gesture={pan}><Animated.View style={[{ flex: 1 }, follow]}>{children}</Animated.View></GestureDetector>;
}

/** The swipe distance a page shares with the page beneath it. */
export function useSwipeOffset() { return useSharedValue(0); }

export type PageMotion = { position: Native.Value; swipe: SharedValue<number> };
// The page beneath travels this share of the width, as in iOS and One UI.
const SHIFT = 0.3;

/** Moves a page left while the page above slides in, and back as that page is swiped away. */
export function ParallaxLayer({ above, width, children }: { above: PageMotion | null; width: number; children: ReactNode }) {
  const idle = useSharedValue(0), swipe = above?.swipe ?? idle;
  // Always drive the drift from an animated value. A native-driven transform
  // that is simply removed keeps its last value on Android, which left this
  // page shifted after a swipe back; a resting value puts it back at 0.
  const [rest] = useState(() => new Native.Value(1));
  const follow = useAnimatedStyle(() => ({ transform: [{ translateX: swipe.get() * SHIFT }] }));
  const drift = above
    ? above.position.interpolate({ inputRange: [0, width], outputRange: [-width * SHIFT, 0], extrapolate: "clamp" })
    : rest.interpolate({ inputRange: [0, 1], outputRange: [-width * SHIFT, 0], extrapolate: "clamp" });
  return <Native.View style={[{ flex: 1 }, { transform: [{ translateX: drift }] }]}><Animated.View style={[{ flex: 1 }, follow]}>{children}</Animated.View></Native.View>;
}
