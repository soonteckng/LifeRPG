import { Redirect } from "expo-router";

// Preserve older saved links after protection moves into real sessions.
export default function FormerProtectionPreview() {
  return <Redirect href="/protection" />;
}
