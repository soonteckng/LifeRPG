import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useUser } from "../context/UserContext";
import OnboardingJourney, { FIRST_INTRO } from "../components/OnboardingJourney";
export { INTRO_PAGES } from "../constants/onboarding";

// Retain old introduction links without splitting the current journey.
export default function TutorialScreen() {
  const router = useRouter();
  const { profile } = useUser();
  useEffect(() => { if (profile.onboarding_completed) router.replace("./guide"); }, [profile.onboarding_completed, router]);
  return profile.onboarding_completed ? null : <OnboardingJourney initialStep={FIRST_INTRO} />;
}
