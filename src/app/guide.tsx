import { View } from "react-native";
import { PersonalPage, p } from "../components/PersonalUI";
import { Text } from "../components/AppText";
const RULES = [
  ["One session, one starting point", "Your focus card brings today's goal, category, suggestion and time together. Tap Change to choose a category or free focus. Choose 30 or 60 minutes, or set a custom time. Finish a session to record your effort. Ending early gives no credit."],
  ["Focus areas fit your life", "Learning, work, creativity, everyday life and wellbeing help you see where your effort goes. Everyday focus fits anything else. Choose the area that fits your session; labels do not measure ability."],
  ["Wellbeing, made clear", "Read a book for pleasure, write in a journal or take a gentle walk. Keep distracting apps closed and give this activity your attention until the timer ends."],
  ["A companion of your own", "Open Personalise on Profile to change your name and choose a complete character look. Your companion greets you when you visit Profile, then breathes, blinks and looks around. Tap it for another greeting. Cosmetic choices keep your saved progress."],
  ["Your milestones", "Profile is home to your milestone collection. Sessions, time, focus days and a steady rhythm unlock milestones automatically. There is nothing to claim and no extra XP is awarded."],
  ["Your effort becomes growth", "Completed seconds count toward your daily goal. Every 60 seconds earns 1 character XP and XP for the chosen Focus area; leftover seconds carry forward. Levels reflect logged effort, not ability. Tap your level on Home or Profile to see the tier path and your next target."],
  ["Your routines, together", "Keep activities you want to return to in Your routines. Your earlier quests appear here too, with their existing schedules and completion history. Choose a routine to start its session or open Manage to edit it. Saving a suggestion as a routine never awards extra XP."],
  ["Reminders are your choice", "Turn on a daily reminder when editing a saved routine and allow notifications on this phone. Reminders do not require Usage Access or Display over other apps. Android can deliver reminders later when precise alarms are off or the phone limits background activity."],
  ["Protection is optional", "The normal timer works without app-protection permissions. The Android protection preview uses Usage Access to detect an open app and Display over other apps to show a cover. Read each permission explanation before choosing whether to allow it. Calls, Settings and Stop remain accessible."],
  ["Consistency, without pressure", "Any completed session with recorded time makes a Focus day. Consecutive days build your Focus streak. Progress also shows your longest streak. A quiet day never removes earned growth or milestones."],
  ["A steady daily goal", "Choose a minimum of 30 minutes per day. Where goal editing is available, you can change it once every seven days. Changes begin the next day; saved daily targets and past achievements stay intact."],
];
export default function GuideScreen() {
  return <PersonalPage title="How LifeRPG works" subtitle="A small guide, whenever you need it." back animateTransition>
    {RULES.map(([title, body]) => <View key={title} style={p.card}><Text style={p.title}>{title}</Text><Text style={p.body}>{body}</Text></View>)}
  </PersonalPage>;
}
