import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../constants/theme";

export interface SheetConfirmationProps {
  destructive?: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Inside the sheet's native Modal, so the dialog is themed and receives touches
// above the sheet without introducing a second native presentation.
export default function SheetConfirmation(props: SheetConfirmationProps) {
  return (
    <View style={styles.overlay} accessibilityViewIsModal onAccessibilityEscape={props.onCancel}>
      <Pressable style={styles.scrim} onPress={props.onCancel} accessibilityLabel={props.cancelLabel} accessibilityRole="button" />
      <View style={styles.dialog}>
        <Text style={styles.title} accessibilityRole="header">{props.title}</Text>
        <Text style={styles.message}>{props.message}</Text>
        <Pressable style={[styles.confirm, props.destructive === false && { backgroundColor: colors.accentSoft }]} onPress={props.onConfirm} accessibilityRole="button">
          <Text style={[styles.confirmText, props.destructive === false && { color: colors.accent }]}>{props.confirmLabel}</Text>
        </Pressable>
        <Pressable style={styles.cancel} onPress={props.onCancel} accessibilityRole="button">
          <Text style={styles.cancelText}>{props.cancelLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 100, elevation: 20, alignItems: "center", justifyContent: "center", padding: 24 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.65)" },
  dialog: { width: "100%", maxWidth: 360, padding: 24, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  title: { color: colors.text, fontSize: 21, fontWeight: "600", marginBottom: 10 },
  message: { color: colors.secondary, fontSize: 14, lineHeight: 21, marginBottom: 24 },
  confirm: { minHeight: 48, padding: 12, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "rgba(252,165,165,0.12)" },
  confirmText: { color: colors.danger, fontSize: 15, fontWeight: "600" },
  cancel: { minHeight: 48, marginTop: 8, padding: 12, alignItems: "center", justifyContent: "center" },
  cancelText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
});

