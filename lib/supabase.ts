import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { connectivityAwareFetch } from "../src/services/cloudConnection";
import { sessionBackendIdentity } from "../src/utils/sessionBackend";

// Static web exports have no browser storage; native/browser sessions remain persistent.
const isServerRender = Platform.OS === "web" && typeof window === "undefined";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    global: { fetch: connectivityAwareFetch(sessionBackendIdentity(supabaseUrl)?.backendId ?? "", (input, init) => fetch(input, init)) },
    auth: {
      storage: isServerRender ? undefined : AsyncStorage,
      autoRefreshToken: !isServerRender,
      persistSession: !isServerRender,
      detectSessionInUrl: false,
      // Links back into the app (Google sign-in, recovery) carry a one-time
      // code that only this phone can exchange, never the login tokens
      // themselves. AuthProvider consumes them explicitly. Email codes typed
      // into the app do not depend on this setting.
      flowType: "pkce",
    },
  }
);
