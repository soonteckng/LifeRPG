import { useEffect } from "react";
import { usePathname } from "expo-router";
import LevelUpModal from "./LevelUpModal";
import { useTimer } from "../context/TimerContext";
import { useUser } from "../context/UserContext";
import { useQuests } from "../context/QuestContext";
import { lifeAreaColor } from "../utils/lifeAreaColor";

export default function GlobalRewardListener() {
  const pathname = usePathname();
  const insideSession = pathname === "/session" || pathname === "/timer";
  const {
    sessionSummary,
    completedLevelUp,
    clearCompletionModal,
    rewardsVisible,
    linkedTaskId,
    targetAttributeId,
  } = useTimer();
  const { profile, reloadProfile } = useUser();
  const {tasks, subjects} = useQuests();
  const quest = tasks.find(task => task.id === linkedTaskId);
  const area = subjects.find(subject => subject.id === targetAttributeId);

  useEffect(() => {
    if (sessionSummary || completedLevelUp) {
      reloadProfile();
    }
  }, [sessionSummary, completedLevelUp, reloadProfile]);

  useEffect(() => {
    // The open Session already presents the saved result. Consume only the
    // popup visibility so navigating away cannot reveal that result again.
    if (insideSession && sessionSummary && rewardsVisible) clearCompletionModal();
  }, [insideSession, sessionSummary, rewardsVisible, clearCompletionModal]);

  const currentXP = profile?.current_xp || 0;
  const currentLevel = profile?.level || 1;
  const requiredXP = Math.floor(100 * Math.pow(currentLevel, 1.5));

  return (
    <LevelUpModal
      visible={rewardsVisible && !insideSession}
      xpEarned={sessionSummary?.xpEarned || 0}
      goldEarned={sessionSummary?.goldEarned || 0}
      creditVersion={sessionSummary?.creditVersion}
      areaXpEarned={sessionSummary?.areaXpEarned}
      characterRemainderSeconds={sessionSummary?.characterRemainderSeconds}
      areaRemainderSeconds={sessionSummary?.areaRemainderSeconds}
      goalReachedNow={sessionSummary?.goalReachedNow}
      minutesSpent={sessionSummary?.minutesSpent || 0}
      durationSeconds={sessionSummary?.durationSeconds}
      questTitle={linkedTaskId != null ? quest?.title || (sessionSummary?.questTitle !== "Quest session" ? sessionSummary?.questTitle : "Quest") : "Free session"}
      areaTitle={area?.title}
      areaColor={lifeAreaColor(targetAttributeId,area?.color_code)}
      isLevelUp={!!completedLevelUp?.leveledUp}
      newLevel={completedLevelUp?.newLevel || currentLevel}
      currentXP={currentXP}
      requiredXP={requiredXP}
      onClose={clearCompletionModal}
    />
  );
}

