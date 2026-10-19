import { useMemo, type ReactNode } from "react";
import { useWindowDimensions } from "react-native";
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

/** How far a sliding page sits from its place: 0 on screen, the width when off to the right. */
export function useSwipeOffset(initial = 0) { return useSharedValue(initial); }

/** Slides a page to `to` on the UI thread; `done` runs on JS once it arrives. */
export function slideTo(offset: SharedValue<number>, to: number, duration: number, done?: () => void) {
  offset.set(withTiming(to, { duration, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System },
    finished => { if (finished && done) runOnJS(done)(); }));
}

export type PageMotion = { swipe: SharedValue<number> };
// The page beneath travels this share of the width, as in iOS and One UI.
const SHIFT = 0.3;

/**
 * Moves a page left while the page above slides in, and back as that page is
 * swiped or slides away. One value drives both pages, so they always move
 * together; with nothing above, the page rests where it belongs.
 */
export function ParallaxLayer({ above, width, children }: { above: PageMotion | null; width: number; children: ReactNode }) {
  const resting = useSharedValue(0), offset = above?.swipe ?? resting, following = !!above;
  const drift = useAnimatedStyle(() => ({ transform: [{ translateX: following ? -SHIFT * Math.max(0, width - offset.get()) : 0 }] }));
  return <Animated.View style={[{ flex: 1 }, drift]}>{children}</Animated.View>;
}
