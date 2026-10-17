import { useMemo, type ReactNode } from "react";
import { useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

/** A second-level page that follows a rightward drag from anywhere on it and
 * leaves when released far or fast enough, like iOS. Vertical scrolling wins
 * when the drag starts vertically. Runs on the UI thread; JS is only called
 * once the page has left. */
export default function SwipeBack({ enabled, onBack, children }: { enabled: boolean; onBack: () => void; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const offset = useSharedValue(0);
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
