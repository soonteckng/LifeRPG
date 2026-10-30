import { colors, radius, edge } from "../constants/theme";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFooter,
  GESTURE_SOURCE,
  useBottomSheetInternal,
  useBottomSheetSpringConfigs,
  useBottomSheetTimingConfigs,
  useGestureEventsHandlersDefault,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
  type GestureEventHandlerCallbackType,
} from "@gorhom/bottom-sheet";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { cancelAnimation, Easing, ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { motion } from "../constants/motion";
import { registerSheetActivity } from "../utils/sheetActivity";
import { SheetDragContext } from "../utils/sheetDrag";

// Every sheet slides on the same calm curve: quick to start, long soft landing, no bounce.
const listTiming = { duration: 280, easing: Easing.out(Easing.cubic) };

interface Props {
  visible: boolean;
  onRequestClose: () => void;
  onDismiss?: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
  // Editors intercept dismissal before any content is hidden or unmounted.
  guardDismiss?: boolean;
  /** A receipt with its own Done action cannot be dismissed by gestures or Back. */
  dismissible?: boolean;
  expanded?: boolean;
  // Content-sized editors must not gain an extra tall snap point.
  compact?: boolean;
  maxHeightRatio?: number;
  // Fixed editors keep their snap point steady while content or keyboard changes.
  heightRatio?: number;
  keyboardBehavior?: "interactive" | "extend" | "fillParent";
  androidKeyboardInputMode?: "adjustPan" | "adjustResize";
  motionMode?: "spring" | "timed";
  overlay?: React.ReactNode;
  footer?: React.ReactNode;
  /** Painted inside the dim behind the sheet, e.g. a soft colour glow for a finished session. */
  backdropGlow?: React.ReactNode;
  label: string;
  activityId?: symbol;
  // An action that leaves for another screen skips the slide, so the next
  // screen appears at once instead of after the sheet has visibly closed.
  closeInstantly?: boolean;
  /** Result-to-reward handoffs fade the whole modal instead of sliding it away. */
  closeMotion?: "slide" | "fade";
  closeFadeDuration?: number;
  // One rule for every sheet: short sheets (menus, confirmations, quick
  // choices) float as a card inside the screen; editors and tall lists dock to
  // the screen edges so inputs, the keyboard and Save keep the full width.
  // Full-height (expanded) sheets are attached unless told otherwise.
  attached?: boolean;
}

const DismissContext = createContext({
  guarded: false,
  dismissible: true,
  requestClose: () => {},
  header: null as React.ReactNode,
  footer: null as React.ReactNode,
  label: "sheet",
  floating: false,
  setDragging: (_dragging: boolean) => {},
});

function SheetSurface({ fade, hidden, onHidden, duration, children }: { fade: boolean; hidden: boolean; onHidden: () => void; duration: number; children: React.ReactNode }) {
  return fade ? <FadingSheetSurface hidden={hidden} onHidden={onHidden} duration={duration}>{children}</FadingSheetSurface> : <>{children}</>;
}

function FadingSheetSurface({ hidden, onHidden, duration, children }: { hidden: boolean; onHidden: () => void; duration: number; children: React.ReactNode }) {
  const opacity = useSharedValue(1);
  const latestHidden = useRef(onHidden);
  useLayoutEffect(() => { latestHidden.current = onHidden; }, [onHidden]);
  useEffect(() => {
    let current = true;
    cancelAnimation(opacity);
    if (!hidden) { opacity.value = 1; return; }
    const finished = () => { if (current) latestHidden.current(); };
    opacity.value = withTiming(0, { duration, reduceMotion: ReduceMotion.System }, done => {
      if (done) runOnJS(finished)();
    });
    return () => { current = false; cancelAnimation(opacity); };
  }, [hidden, opacity, duration]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View testID="sheet-exit-fade" style={[styles.root, style]}>{children}</Animated.View>;
}

// Keep the handle component's identity stable while typing or saving.
function SheetHandle() {
  const { header, label, requestClose, dismissible } = useContext(DismissContext);
  return (
    <View>
      <View
        style={styles.handleTarget}
        accessible={dismissible}
        accessibilityRole={dismissible ? "button" : undefined}
        accessibilityLabel={dismissible ? `Dismiss ${label}` : undefined}
        accessibilityHint={dismissible ? "Swipe down or activate to dismiss" : undefined}
        accessibilityActions={dismissible ? [{ name: "activate", label: "Dismiss" }] : undefined}
        onAccessibilityAction={dismissible ? requestClose : undefined}
      >
        {dismissible && <View style={styles.handle} />}
      </View>
      {header}
    </View>
  );
}

// Do not create a new footer component whenever its contents or measurements
// change. A stable native footer keeps its measured height and animated anchor
// while pending results settle or an editor updates its actions.
function SheetFooter(props: BottomSheetFooterProps) {
  const { footer, floating } = useContext(DismissContext);
  // The sheet's container already ends above a floating card's bottom inset.
  // A floating card's footer follows its rounded corners instead of poking out.
  return <BottomSheetFooter {...props} bottomInset={0}>{floating ? <View style={styles.floatingFooter}>{footer}</View> : footer}</BottomSheetFooter>;
}

// Retain the library's native scroll/pan coordination even when dismissal needs
// confirmation. Only intercept a downward release from the handle or list top.
function useDismissGestures() {
  const { guarded, requestClose, setDragging } = useContext(DismissContext);
  const { animatedScrollableState, animatedPosition } = useBottomSheetInternal();
  const defaults = useGestureEventsHandlersDefault();
  const startedAtTop = useSharedValue(false);
  const startPosition = useSharedValue(0);
  // Set once a pull actually moves the sheet down, so its fields stay calm.
  const pulling = useSharedValue(false);
  const handleOnStart = useCallback<GestureEventHandlerCallbackType>(
    (source, event) => {
      "worklet";
      startedAtTop.set(
        source === GESTURE_SOURCE.HANDLE ||
          animatedScrollableState.get().contentOffsetY <= 0,
      );
      defaults.handleOnStart(source, event);
      startPosition.set(animatedPosition.get());
    },
    [animatedScrollableState, animatedPosition, defaults, startedAtTop, startPosition],
  );
  const handleOnChange = useCallback<GestureEventHandlerCallbackType>(
    (source, event) => {
      "worklet";
      defaults.handleOnChange(source, event);
      if (!pulling.get() && startedAtTop.get() && event.translationY > 6) {
        pulling.set(true);
        runOnJS(setDragging)(true);
      }
      // Dirty drafts cannot close natively, but their surface should still track
      // a downward pull one-to-one. The default release restores its snap point
      // before our existing discard guard runs; scrolling stays library-owned.
      if (guarded && startedAtTop.get() && event.translationY > 0 &&
          (source === GESTURE_SOURCE.HANDLE || animatedScrollableState.get().contentOffsetY <= 0)) {
        animatedPosition.set(startPosition.get() + event.translationY);
      }
    },
    [animatedPosition, animatedScrollableState, defaults, guarded, pulling, setDragging, startedAtTop, startPosition],
  );
  const handleOnEnd = useCallback<GestureEventHandlerCallbackType>(
    (source, event) => {
      "worklet";
      defaults.handleOnEnd(source, event);
      if (pulling.get()) {
        pulling.set(false);
        runOnJS(setDragging)(false);
      }
      if (guarded && startedAtTop.get() && event.translationY > 60)
        runOnJS(requestClose)();
    },
    [defaults, guarded, pulling, requestClose, setDragging, startedAtTop],
  );
  // A cancelled pull never reaches End; release the fields here instead.
  const handleOnFinalize = useCallback<GestureEventHandlerCallbackType>(
    (source, event) => {
      "worklet";
      if (pulling.get()) {
        pulling.set(false);
        runOnJS(setDragging)(false);
      }
      defaults.handleOnFinalize(source, event);
    },
    [defaults, pulling, setDragging],
  );
  return { ...defaults, handleOnStart, handleOnChange, handleOnEnd, handleOnFinalize };
}

export default function AppSheet({
  visible,
  onRequestClose,
  onDismiss,
  header,
  children,
  guardDismiss = false,
  dismissible = true,
  expanded = false,
  compact = false,
  maxHeightRatio = 0.82,
  heightRatio = 0.88,
  keyboardBehavior,
  androidKeyboardInputMode = "adjustResize",
  motionMode = "timed",
  overlay,
  footer,
  label,
  activityId,
  closeInstantly = false,
  closeMotion = "slide",
  closeFadeDuration = 220,
  attached = expanded,
  backdropGlow,
}: Props) {
  const floating = !attached;
  const springConfigs = useBottomSheetSpringConfigs(motion.sheet);
  const timingConfigs = useBottomSheetTimingConfigs(listTiming);
  const animationConfigs = motionMode === "timed" ? timingConfigs : springConfigs;
  const ref = useRef<BottomSheet>(null);
  const [mounted, setMounted] = useState(visible);
  const [activityToken] = useState(() => activityId ?? Symbol("app-sheet"));
  const mountedRef = useRef(mounted);
  const releaseActivity = useRef<(() => void) | null>(null);
  const releaseBlocker = useCallback(() => {
    const release = releaseActivity.current;
    releaseActivity.current = null;
    release?.();
  }, []);
  useLayoutEffect(() => {
    mountedRef.current = mounted;
    if (mounted && !releaseActivity.current) releaseActivity.current = registerSheetActivity(activityToken);
    // iOS still owns a native modal while its dismissal callback is pending.
    // Android/web finish at the bottom sheet's own close callback.
    else if (!mounted && Platform.OS !== "ios") releaseBlocker();
  }, [activityToken, mounted, releaseBlocker]);
  useLayoutEffect(() => releaseBlocker, [releaseBlocker]);
  const [previousVisible, setPreviousVisible] = useState(visible);
  // While the sheet is pulled down its text fields ignore taps. The release is
  // held back a moment: the lifted finger's tap arrives after the pull ends.
  const [dragging, setDraggingNow] = useState(false);
  const dragRelease = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setDragging = useCallback((next: boolean) => {
    if (dragRelease.current) { clearTimeout(dragRelease.current); dragRelease.current = null; }
    if (next) setDraggingNow(true);
    else dragRelease.current = setTimeout(() => { dragRelease.current = null; setDraggingNow(false); }, 300);
  }, []);
  useEffect(() => () => { if (dragRelease.current) clearTimeout(dragRelease.current); }, []);
  const keyboardVisible = useRef(false);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const maxHeight = Math.max(240, height - insets.top - 24);
  const floatInset = floating ? Math.max(insets.bottom, 8) + 8 : 0;
  const snapPoints = useMemo(
    () =>
      compact
        ? undefined
        : [expanded ? Math.min(height * heightRatio, maxHeight) : maxHeight],
    [compact, expanded, height, heightRatio, maxHeight],
  );
  if (previousVisible !== visible) {
    setPreviousVisible(visible);
    if (visible) setMounted(true);
  }


  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => {
      keyboardVisible.current = true;
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      keyboardVisible.current = false;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const requestBack = useCallback(() => {
    if (keyboardVisible.current || Keyboard.isVisible()) {
      Keyboard.dismiss();
      return;
    }
    if (dismissible) onRequestClose();
  }, [dismissible, onRequestClose]);

  const finishClose = useCallback(() => {
    // A native close queued before a locked receipt was shown must not bypass
    // its Done action. Restore the existing snap point instead.
    if (visible && !dismissible) { ref.current?.snapToIndex?.(0); return; }
    setMounted(false);
    if (visible) onRequestClose();
    // iOS must finish dismissing its native modal before a new route is presented.
    if (Platform.OS !== "ios") onDismiss?.();
  }, [visible, dismissible, onRequestClose, onDismiss]);

  const latestFinishClose = useRef(finishClose);
  useLayoutEffect(() => { latestFinishClose.current = finishClose; });
  const visibleRef = useRef(visible);
  useLayoutEffect(() => { visibleRef.current = visible; }, [visible]);
  useEffect(() => {
    if (!visible && mounted) {
      Keyboard.dismiss();
      if (closeInstantly) { latestFinishClose.current(); return; }
      if (closeMotion !== "fade") ref.current?.close();
      // Some Android keyboards swallow the sheet's close callback, which would
      // leave an invisible modal over the screen. Finish the close regardless.
      const fallback = setTimeout(() => { if (!visibleRef.current && mountedRef.current) latestFinishClose.current(); }, 900);
      return () => clearTimeout(fallback);
    }
    // Only a visibility change closes; re-renders must not restart the slide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mounted]);

  const backdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.55}
        pressBehavior="none"
        accessible={false}
      >
        {backdropGlow}
        {/* 'none' disables the library's tap recognizer. Supply our own target so
          draft confirmation runs before closing rather than bypassing it. */}
        {dismissible && <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onRequestClose}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss ${label}`}
          accessibilityHint="Closes the sheet or returns from the editor"
        />}
      </BottomSheetBackdrop>
    ),
    [dismissible, onRequestClose, label, backdropGlow],
  );

  return (
    <Modal
      transparent
      visible={mounted}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent={false}
      onRequestClose={requestBack}
      onDismiss={() => {
        // A delayed dismissal from an older close cannot release a reopened
        // sheet, replay navigation, or notify an already unmounted owner.
        if (Platform.OS === "ios" && !mountedRef.current && releaseActivity.current) {
          releaseBlocker();
          onDismiss?.();
        }
      }}
    >
      {mounted && (
        <SheetSurface fade={closeMotion === "fade"} hidden={!visible} onHidden={finishClose} duration={closeFadeDuration}>
        <GestureHandlerRootView
          style={styles.root}
          accessibilityViewIsModal
          onAccessibilityEscape={requestBack}
        >
          <DismissContext.Provider
            value={{
              guarded: guardDismiss,
              dismissible,
              requestClose: onRequestClose,
              header,
              footer,
              label,
              floating,
              setDragging,
            }}
          >
            <BottomSheet
              ref={ref}
              index={0}
              animationConfigs={animationConfigs}
              snapPoints={snapPoints}
              enableDynamicSizing={compact || !expanded}
              maxDynamicContentSize={Math.min(
                height * maxHeightRatio,
                maxHeight,
              )}
              topInset={insets.top + 12}
              detached={floating}
              bottomInset={floatInset}
              style={floating ? styles.floating : undefined}
              enablePanDownToClose={dismissible && !guardDismiss}
              enableHandlePanningGesture={dismissible}
              enableContentPanningGesture={dismissible}
              enableOverDrag={dismissible && guardDismiss}
              gestureEventsHandlersHook={useDismissGestures}
              keyboardBehavior={
                keyboardBehavior ?? (!compact && (expanded || guardDismiss)
                  ? "fillParent"
                  : "interactive")
              }
              keyboardBlurBehavior="restore"
              enableBlurKeyboardOnGesture
              android_keyboardInputMode={androidKeyboardInputMode}
              overrideReduceMotion={ReduceMotion.System}
              backgroundStyle={floating ? styles.floatingSurface : styles.surface}
              backdropComponent={backdrop}
              onClose={() => latestFinishClose.current()}
              footerComponent={footer ? SheetFooter : undefined}
              handleComponent={SheetHandle}
            >
              <SheetDragContext.Provider value={dragging}>{children}</SheetDragContext.Provider>
            </BottomSheet>
          </DismissContext.Provider>
          {overlay}
        </GestureHandlerRootView>
        </SheetSurface>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Every sheet carries the same hairline edge as the cards, attached or floating.
  surface: {
    ...edge,
    borderBottomWidth: 0,
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  floating: { marginHorizontal: 8 },
  floatingFooter: { overflow: "hidden", borderBottomLeftRadius: radius.sheet, borderBottomRightRadius: radius.sheet },
  floatingSurface: { ...edge, backgroundColor: colors.surfaceRaised, borderRadius: radius.sheet },
  handleTarget: { height: 28, alignItems: "center", justifyContent: "center" },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
});
