import { Redirect } from "expo-router";

// Older timer links enter the same root Session modal as every other entry point.
export default function TimerRoute() {
  return <Redirect href="/session" />;
}
