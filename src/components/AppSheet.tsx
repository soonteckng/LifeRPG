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
import { Easing, ReduceMotion, runOnJS, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { motion } from "../constants/motion";
import { registerSheetActivity } from "../utils/sheetActivity";

const listTiming = { duration: 220, easing: Easing.out(Easing.cubic) };

interface Props {
  visible: boolean;
  onRequestClose: () => void;
  onDismiss?: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
  // Editors intercept dismissal before any content is hidden or unmounted.
  guardDismiss?: boolean;
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
  label: string;
  activityId?: symbol;
  // An action that leaves for another screen skips the slide, so the next
  // screen appears at once instead of after the sheet has visibly closed.
  closeInstantly?: boolean;
  // Short content floats as a rounded card above the screen edge instead of
  // a full-width sheet with empty space beneath it.
  floating?: boolean;
}

const DismissContext = createContext({
  guarded: false,
  requestClose: () => {},
  header: null as React.ReactNode,
  footer: null as React.ReactNode,
  label: "sheet",
});

// Keep the handle component's identity stable while typing or saving.
function SheetHandle() {
  const { header, label, requestClose } = useContext(DismissContext);
  return (
    <View>
      <View
        style={styles.handleTarget}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Dismiss ${label}`}
        accessibilityHint="Swipe down or activate to dismiss"
        accessibilityActions={[{ name: "activate", label: "Dismiss" }]}
        onAccessibilityAction={requestClose}
      >
        <View style={styles.handle} />
      </View>
      {header}
    </View>
  );
}

// Do not create a new footer component whenever its contents or measurements
// change. A stable native footer keeps its measured height and animated anchor
// while pending results settle or an editor updates its actions.
function SheetFooter(props: BottomSheetFooterProps) {
  const { footer } = useContext(DismissContext);
  // The sheet's container already ends above a floating card's bottom inset.
  return <BottomSheetFooter {...props} bottomInset={0}>{footer}</BottomSheetFooter>;
}

// Retain the library's native scroll/pan coordination even when dismissal needs
// confirmation. Only intercept a downward release from the handle or list top.
function useDismissGestures() {
  const { guarded, requestClose } = useContext(DismissContext);
  const { animatedScrollableState, animatedPosition } = useBottomSheetInternal();
  const defaults = useGestureEventsHandlersDefault();
  const startedAtTop = useSharedValue(false);
  const startPosition = useSharedValue(0);
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
      // Dirty drafts cannot close natively, but their surface should still track
      // a downward pull one-to-one. The default release restores its snap point
      // before our existing discard guard runs; scrolling stays library-owned.
      if (guarded && startedAtTop.get() && event.translationY > 0 &&
          (source === GESTURE_SOURCE.HANDLE || animatedScrollableState.get().contentOffsetY <= 0)) {
        animatedPosition.set(startPosition.get() + event.translationY);
      }
    },
    [animatedPosition, animatedScrollableState, defaults, guarded, startedAtTop, startPosition],
  );
  const handleOnEnd = useCallback<GestureEventHandlerCallbackType>(
    (source, event) => {
      "worklet";
      defaults.handleOnEnd(source, event);
      if (guarded && startedAtTop.get() && event.translationY > 60)
        runOnJS(requestClose)();
    },
    [defaults, guarded, requestClose, startedAtTop],
  );
  return { ...defaults, handleOnStart, handleOnChange, handleOnEnd };
}

export default function AppSheet({
  visible,
  onRequestClose,
  onDismiss,
  header,
  children,
  guardDismiss = false,
  expanded = false,
  compact = false,
  maxHeightRatio = 0.82,
  heightRatio = 0.88,
  keyboardBehavior,
  androidKeyboardInputMode = "adjustResize",
  motionMode = "spring",
  overlay,
  footer,
  label,
  activityId,
  closeInstantly = false,
  floating = false,
}: Props) {
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
    onRequestClose();
  }, [onRequestClose]);

  const finishClose = useCallback(() => {
    setMounted(false);
    if (visible) onRequestClose();
    // iOS must finish dismissing its native modal before a new route is presented.
    if (Platform.OS !== "ios") onDismiss?.();
  }, [visible, onRequestClose, onDismiss]);

  const latestFinishClose = useRef(finishClose);
  useLayoutEffect(() => { latestFinishClose.current = finishClose; });
  useEffect(() => {
    if (!visible && mounted) {
      Keyboard.dismiss();
      if (closeInstantly) latestFinishClose.current();
      else ref.current?.close();
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
        {/* 'none' disables the library's tap recognizer. Supply our own target so
          draft confirmation runs before closing rather than bypassing it. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onRequestClose}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss ${label}`}
          accessibilityHint="Closes the sheet or returns from the editor"
        />
      </BottomSheetBackdrop>
    ),
    [onRequestClose, label],
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
        <GestureHandlerRootView
          style={styles.root}
          accessibilityViewIsModal
          onAccessibilityEscape={requestBack}
        >
          <DismissContext.Provider
            value={{
              guarded: guardDismiss,
              requestClose: onRequestClose,
              header,
              footer,
              label,
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
              enablePanDownToClose={!guardDismiss}
              enableHandlePanningGesture
              enableContentPanningGesture
              enableOverDrag={guardDismiss}
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
              onClose={finishClose}
              footerComponent={footer ? SheetFooter : undefined}
              handleComponent={SheetHandle}
            >
              {children}
            </BottomSheet>
          </DismissContext.Provider>
          {overlay}
        </GestureHandlerRootView>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  surface: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  floating: { marginHorizontal: 8 },
  floatingSurface: { ...edge, backgroundColor: colors.surfaceRaised, borderRadius: radius.sheet },
  handleTarget: { height: 28, alignItems: "center", justifyContent: "center" },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.24)",
  },
});
