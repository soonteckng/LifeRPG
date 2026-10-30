import * as Font from "expo-font";
import { fonts } from "../constants/theme";
import { fontState } from "../utils/fontState";

// The fonts ship inside the app update itself, so they work offline and need
// no new build. Loading is attempted once; a failure keeps the system font.
let loading: Promise<boolean> | null = null;
export function loadAppFonts(): Promise<boolean> {
  loading ??= Font.loadAsync({
    [fonts.display]: require("../../assets/fonts/Newsreader_400Regular.ttf"),
    [fonts.displayMedium]: require("../../assets/fonts/Newsreader_500Medium.ttf"),
    [fonts.body]: require("../../assets/fonts/Inter_400Regular.ttf"),
    [fonts.bodyMedium]: require("../../assets/fonts/Inter_500Medium.ttf"),
    [fonts.bodySemiBold]: require("../../assets/fonts/Inter_600SemiBold.ttf"),
    [fonts.bodyBold]: require("../../assets/fonts/Inter_700Bold.ttf"),
  }).then(() => { fontState.markReady(); return true; }, () => false);
  return loading;
}
