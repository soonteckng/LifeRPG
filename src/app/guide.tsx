import { View } from "react-native";
import { PersonalPage, p } from "../components/PersonalUI";
import { Text } from "../components/AppText";
const RULES = [
  ["Focus, one block at a time", "Free focus and suggestions share one card. Focus length sets 30 or 60 minutes, or a custom timer. Changing Focus area updates your suggestion to match. Everyday focus and custom areas use free focus. Find your next step offers other prompts for your direction. Finish a session to save focus time. Ending early cancels the session and gives no credit."],
  ["Focus areas fit your life", "Learning, work, creativity, everyday life and wellbeing help you see where your effort goes. Everyday focus fits anything else. Choose the area that fits your session; labels do not measure ability."],
  ["Wellbeing, made clear", "Read a book for pleasure, write in a journal or take a gentle walk. Keep distracting apps closed and give this activity your attention until the timer ends."],
  ["A companion of your own", "Open Personalise on Profile to change your name and choose a complete character look. Your companion breathes, blinks and greets you when tapped. Cosmetic choices keep your saved progress."],
  ["Your milestones", "Profile is home to your milestone collection. Sessions, time, focus days and a steady rhythm unlock milestones automatically. There is nothing to claim and no extra XP is awarded."],
  ["Your effort becomes growth", "Completed seconds count toward your daily goal. Every 60 seconds earns 1 character XP and XP for the chosen Focus area; leftover seconds carry forward. Levels reflect logged effort, not ability. Tap your level on Home or Profile to see the tier path and your next target."],
  ["Quests stay yours", "Create a personal quest, choose a duration and Focus area, and optionally repeat it. Your quests stay alongside suggestions. Saving a suggested block never awards XP again."],
  ["Consistency, without pressure", "Any completed session with focused time makes a Focus day. Consecutive days build your Focus streak. Progress also shows your longest streak. A quiet day never removes earned growth or milestones."],
  ["A steady daily goal", "Choose a minimum of 30 minutes per day. Where goal editing is available, you can change it once every seven days. Changes begin the next day; saved daily targets and past achievements stay intact."],
];
export default function GuideScreen() {
  return <PersonalPage title="How LifeRPG works" subtitle="A small guide, whenever you need it." back animateTransition>
    {RULES.map(([title, body]) => <View key={title} style={p.card}><Text style={p.title}>{title}</Text><Text style={p.body}>{body}</Text></View>)}
  </PersonalPage>;
}
