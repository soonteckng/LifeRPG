import { forwardRef, useContext, type ComponentProps, type ElementRef } from "react";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { SheetDragContext } from "../utils/sheetDrag";

type Props = ComponentProps<typeof BottomSheetTextInput>;

/** A sheet's text field. It ignores the tap that ends a swipe-down, so no keyboard flash. */
const SheetTextInput = forwardRef<ElementRef<typeof BottomSheetTextInput>, Props>(function SheetTextInput(props, ref) {
  const dragging = useContext(SheetDragContext);
  return <BottomSheetTextInput {...props} ref={ref} editable={props.editable !== false && !dragging} />;
});
export default SheetTextInput;
