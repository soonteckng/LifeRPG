/** Size a result around its content while leaving long details scrollable.
 * The handle is owned by AppSheet. Body measurements exclude the scrollable's
 * footer padding; actions are anchored by the native bottom sheet footer.
 */
export function completionSheetHeight({ windowHeight, topInset, headerHeight, bodyHeight, actionsHeight }: {
  windowHeight: number;
  topInset: number;
  headerHeight: number;
  bodyHeight: number;
  actionsHeight: number;
}) {
  const available = Math.max(240, windowHeight - topInset - 24);
  const maximum = Math.min(windowHeight * 0.85, available);
  return Math.min(maximum, Math.max(240, 28 + headerHeight + bodyHeight + actionsHeight));
}
