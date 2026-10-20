import { createContext } from "react";

/**
 * True while a sheet is being pulled down. A text field under the finger must
 * not take focus when that finger lifts, or the keyboard flashes up while the
 * sheet slides away.
 */
export const SheetDragContext = createContext(false);
