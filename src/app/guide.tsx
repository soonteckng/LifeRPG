import { View } from "react-native";
import { PersonalPage, p } from "../components/PersonalUI";
import { Text } from "../components/AppText";
const RULES = [
  ["Starting a session", "Home’s Start card has your routines, ready in one tap, and a way to focus on anything else. On Routines, Just focus does the same, and every routine and subject has its own ▶. Finish the session to keep your time and XP. If you end early, it isn’t saved."],
  ["Routines", "Save the things you keep coming back to, with a length, a category and a daily reminder if you want one. Not sure where to start? Grab one of the ideas. If your phone supports it, open a routine and tap Add widget to put it on your home screen."],
  ["Study and exams", "Add the subjects you’re taking and tap ▶ to study one. Add your exams too, and they’ll count down on Study and Home, with reminders if you like. Studying a subject with an exam coming up counts as Revision. The rest counts as Learning."],
  ["Changing things", "Hold a routine, subject or exam and the list starts to wiggle. Tap ✎ to edit or − to remove. We’ll always check before removing anything. Tap Done when you’re finished."],
  ["Protection, if you want it", "A protected session covers the apps you set aside until it ends, with one 5-minute break. It needs Usage Access, Display over other apps and notifications, and we explain each one before you allow it. Calls, Settings and End session are always within reach."],
  ["Growing your companion", "Every full minute you finish earns 1 XP for your companion and for that session’s category, and spare seconds carry over. Levels show the effort you put in, not how talented you are. Tap your level on Home to see what’s ahead."],
  ["Daily goal and streak", "Finished time counts toward your daily goal. Any day with a finished session is a Focus day, and Focus days in a row grow your streak. You can change your goal once a week, and it kicks in the next day."],
  ["Squads", "Make a squad or join a friend’s with its code, and cheer each other on through the week. In one squad? The Squads tab opens straight to it. Squads are optional and never touch your own progress."],
  ["Progress", "See your time for each day, week or month, sorted by category. Tap a day, switch between that day and the whole week or month, then tap a category to see its sessions, day by day."],
  ["Profile and milestones", "Tap your companion on Home to open Profile. Pick a look, watch your categories grow and collect milestones. They unlock on their own as you go."],
  ["Offline", "No connection? No problem. Sessions save on your phone and sync when you’re back online. Things that need the internet, like joining a squad, wait until then."],
];
export default function GuideScreen() {
  return <PersonalPage title="How LifeRPG works" subtitle="Everything from the tour, plus a few extras." back animateTransition>
    {RULES.map(([title, body]) => <View key={title} style={p.card}><Text style={p.title}>{title}</Text><Text style={p.body}>{body}</Text></View>)}
  </PersonalPage>;
}
