import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useUser } from "../context/UserContext";
import OnboardingJourney from "../components/OnboardingJourney";
export { INTRO_PAGES } from "../constants/onboarding";

// Retain old introduction links without splitting the current seven-page journey.
export default function TutorialScreen() {
  const router = useRouter();
  const { profile } = useUser();
  useEffect(() => { if (profile.onboarding_completed) router.replace("./guide"); }, [profile.onboarding_completed, router]);
  return profile.onboarding_completed ? null : <OnboardingJourney initialStep={4} />;
}
