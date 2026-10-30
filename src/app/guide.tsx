import { View } from "react-native";
import { PersonalPage, p } from "../components/PersonalUI";
import { Text } from "../components/AppText";
const RULES = [
  ["Today is home", "Everything starts on Today. Routines, Study, Squads and Your rhythm open from the list at the bottom, and each one comes back to Today with the Today link at the top."],
  ["Starting a session", "Today’s Start card has your routines, ready in one tap, and a way to focus on anything else. On Routines, Just focus does the same, and every routine and subject has its own ▶. Finish the session to keep its time. If you end early, it isn’t saved."],
  ["Your activities", "Save the things you keep coming back to, with a length and a tag. Choose Repeats for a daily reminder at a set time, or Any time to start it whenever you like. Not sure where to start? Grab one of the ideas. If your phone supports it, turn on Add widget when you make a routine to put it on your home screen. You can also add one later from the routine."],
  ["Study and exams", "Add the subjects you’re taking and tap ▶ to study one. Add your exams too, and they’ll count down on Study and Today, with reminders if you like. Studying a subject with an exam coming up counts as Revision. The rest counts as Learning."],
  ["Changing things", "Hold a routine, subject or exam and the list starts to wiggle. Tap ✎ to edit or − to remove. We’ll always check before removing anything. Tap Done when you’re finished."],
  ["Protection, if you want it", "A protected session covers the apps you set aside until it ends, with one 5-minute break. It needs Usage Access, Display over other apps and notifications, and we explain each one before you allow it. Calls, Settings and End session are always within reach."],
  ["Daily goal and streak", "Finished time counts toward your daily goal. Any day with a finished session is a Focus day, and Focus days in a row grow your streak. Every 7 days in your streak earns a rest day (you can keep 2). Miss a day and one is used for you, so your streak carries on. You can change your goal once a week, and it kicks in the next day."],
  ["Squads", "Make a squad or join a friend’s with its code, and cheer each other on through the week. In one squad? Squads opens straight to it. Your circle is listed by name, never ranked, with whoever is focusing now at the top. Squads are optional and never touch your own progress."],
  ["Your rhythm", "See your time for each day, week or month, sorted by category. Tap a day, switch between that day and the whole week or month, then tap a category to see its sessions, day by day. Along the way notes a few round numbers from your own history, like hours focused or days you showed up."],
  ["Profile", "Tap your initials on Today to open Profile. Change your name and see your all-time time, focus days, best streak and categories."],
  ["Offline", "No connection? No problem. Sessions save on your phone and sync when you’re back online. Things that need the internet, like joining a squad, wait until then."],
];
export default function GuideScreen() {
  return <PersonalPage title="How LifeRPG works" subtitle="Everything from the tour, plus a few extras." back animateTransition>
    {RULES.map(([title, body]) => <View key={title} style={p.card}><Text style={p.title}>{title}</Text><Text style={p.body}>{body}</Text></View>)}
  </PersonalPage>;
}
