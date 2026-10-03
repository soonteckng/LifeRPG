import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

// Static web exports have no browser storage; native/browser sessions remain persistent.
const isServerRender = Platform.OS === "web" && typeof window === "undefined";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      storage: isServerRender ? undefined : AsyncStorage,
      autoRefreshToken: !isServerRender,
      persistSession: !isServerRender,
      detectSessionInUrl: false,
      // Native recovery links are consumed explicitly by AuthProvider.
      flowType: "implicit",
    },
  }
);