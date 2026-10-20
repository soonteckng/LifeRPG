import { View } from "react-native";
import { PersonalPage, p } from "../components/PersonalUI";
import { Text } from "../components/AppText";
const RULES = [
  ["Start a session", "On Home, the green button starts your next step. Just focus on Routines starts any activity at your own length, a routine starts with its ▶, and so does a subject in Study. Finish the session to record your effort. Ending early saves no time or XP."],
  ["Routines", "Save something you want to return to, with its length, category and an optional daily reminder. Start from one of the ideas if you like. Where your phone supports it, a routine can also sit on your home screen: open it and tap Add widget."],
  ["Study and exams", "Add the subjects you’re taking and tap ▶ to study one. Add your exams: each counts down on Study and Home, with reminders if you want them. Studying a subject with an exam coming up counts as Revision; otherwise it counts as Learning."],
  ["Editing anything", "Hold a routine, subject or exam: the list wiggles and each card shows ✎ to edit and − to remove. Removing always asks first. Tap a card or Done when you’re finished."],
  ["Protection is optional", "A protected session covers the apps you set aside until it ends, with one 5-minute break. It needs Usage Access, Display over other apps and notifications; each is explained before you allow it. Calls, Settings and End session always stay within reach."],
  ["Your effort becomes growth", "Every 60 completed seconds earns 1 XP for your companion and for the session’s category; leftover seconds carry forward. Levels reflect recorded effort, not ability. Tap your level on Home to see the tier path."],
  ["Your daily goal and streak", "Completed time counts toward your daily goal. Any day with a completed session is a Focus day, and Focus days in a row build your streak. You can change your goal once every seven days; changes start the next day."],
  ["Squads", "Start a squad or join one with its code, and see each other’s week together. Squads are optional and never change your own progress."],
  ["Progress", "See the time you recorded each day, week or month, by category, with every session listed. Tap a category or a day for the details."],
  ["Profile and milestones", "Tap your companion on Home to open Profile. Choose a look, see your categories grow and collect milestones; they unlock on their own as you go."],
  ["Offline", "Without a connection, sessions save on this phone and sync when you’re back online. Anything that needs the server, like joining a squad, waits until then."],
];
export default function GuideScreen() {
  return <PersonalPage title="How LifeRPG works" subtitle="Everything the first-run guide showed you, and a little more." back animateTransition>
    {RULES.map(([title, body]) => <View key={title} style={p.card}><Text style={p.title}>{title}</Text><Text style={p.body}>{body}</Text></View>)}
  </PersonalPage>;
}
