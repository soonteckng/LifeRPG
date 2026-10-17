import type { ComponentProps } from "react";
import { TouchableOpacity } from "@gorhom/bottom-sheet";
import { tapHaptic, tapHapticsEnabled } from "../utils/tapHaptics";

// The sheet's own touchable (it cooperates with the drag), plus the app's tap tick.
export default function SheetTouchable({ onPress, ...props }: ComponentProps<typeof TouchableOpacity>) {
  return <TouchableOpacity {...props} onPress={onPress && (event => { onPress(event); if (tapHapticsEnabled()) tapHaptic(); })} />;
}
