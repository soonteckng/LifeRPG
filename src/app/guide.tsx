import { View } from "react-native";
import { PersonalButton, PersonalPage, p } from "../components/PersonalUI";
import { Text } from "../components/AppText";
import { useFeatureTour } from "../components/FeatureTour";
import { useTimer } from "../context/TimerContext";
const RULES = [
  ["Focus, one block at a time", "Start free focus or follow a suggestion. Finish a session to save focus time. Ending early cancels the session and gives no credit."],
  ["Your effort becomes growth", "Completed seconds count toward your daily goal. Every 60 seconds earns 1 character XP and XP for the chosen Life area; leftover seconds carry forward. Levels reflect logged effort, not ability."],
  ["Quests stay yours", "Create a personal quest, choose a duration and Life area, and optionally repeat it. Your quests stay alongside suggestions. Saving a suggested block never awards XP again."],
  ["Consistency, without pressure", "Any completed session with focused time makes a Focus day. Consecutive days build your Focus streak. Progress also shows your longest streak. A quiet day never removes earned growth or milestones."],
  ["A steady daily goal", "Choose a minimum of 30 minutes per day. Where goal editing is available, you can change it once every seven days. Changes begin the next day; saved daily targets and past achievements stay intact."],
];
export default function GuideScreen() {
  const tour = useFeatureTour(), timer = useTimer();
  return <PersonalPage title="How LifeRPG works" subtitle="A small guide, whenever you need it." back animateTransition>
    {RULES.map(([title, body]) => <View key={title} style={p.card}><Text style={p.title}>{title}</Text><Text style={p.body}>{body}</Text></View>)}
    <PersonalButton title="Take a quick tour" disabled={!tour || timer.hasOpenSession} onPress={() => tour?.start()} />
    {timer.hasOpenSession && <Text style={p.caption}>Finish or end your session before starting the tour.</Text>}
  </PersonalPage>;
}
