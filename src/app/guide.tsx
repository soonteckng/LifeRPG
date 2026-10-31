import { View } from "react-native";
import { PersonalPage, p } from "../components/PersonalUI";
import { Text } from "../components/AppText";
// Round 88: rewritten for the simpler app, now that the step-by-step tour is gone.
const RULES = [
  ["Today is home", "Up next shows what’s next today, with Start right there. Later today lists the rest, and Something else is for anything at all. Your activities, Your rhythm and Your circle open from Today and come back to it."],
  ["A session stays with you", "Once a session starts it stays on screen until you end it, so it’s just you and the timer. A protected session gets one short break; any other session can pause. Let it run to the end to keep its time. If you end early, it isn’t saved."],
  ["Your activities", "Save the things you keep coming back to, with a length and a tag. Choose Repeats for a daily reminder at a set time, or Any time to start it whenever you like. Not sure where to start? Ideas has a few picks that change each day. Hold an activity to edit or remove it."],
  ["Study and exams", "Add the subjects you’re taking from Your activities and tap ▶ to study one. Add your exams too, and they’ll count down on Today. Studying a subject with an exam coming up counts as Revision."],
  ["Protection, if you want it", "A protected session covers the apps you set aside until it ends, with one 5-minute break. It needs Usage Access, Display over other apps and notifications, and we explain each one before you allow it. Calls, Settings and End are always within reach."],
  ["Daily goal and streak", "Finished time counts toward your daily goal. Any day with a finished session is a Focus day, and Focus days in a row grow your streak. Every 7 days in your streak earns a rest day (you can keep 2). Miss a day and one is used for you, so your streak carries on."],
  ["Your rhythm", "This week at a glance: your time, the days you showed up and time by activity. Use the arrows for earlier weeks and tap a day for its sessions. More detail has the full charts."],
  ["Your circle", "Make a squad or join a friend’s with its code. Friends are listed by name, never ranked. When one is focusing, Join starts your own session alongside theirs."],
  ["Offline", "No connection? Sessions save on your phone and sync when you’re back online. Things that need the internet, like joining a squad, wait until then."],
];
export default function GuideScreen() {
  return <PersonalPage title="How LifeRPG works" subtitle="The short version of everything." back animateTransition>
    {RULES.map(([title, body]) => <View key={title} style={p.card}><Text style={p.title}>{title}</Text><Text style={p.body}>{body}</Text></View>)}
  </PersonalPage>;
}
