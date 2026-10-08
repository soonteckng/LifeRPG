const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const React = require("react"), { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, "..", file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith(".")) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const ext = ["", ".ts", ".tsx"].find(ext => fs.existsSync(target + ext));
    return load(path.relative(path.resolve(__dirname, ".."), target + ext), mocks, cache);
  }, module, module.exports);
  return module.exports;
}
const growth = load("src/utils/characterGrowth.ts");
const now = new Date("2026-10-08T04:00:00Z");
const session = (id, completed_at, duration_seconds = 60, subject_id = 1) => ({ id, completed_at, duration_seconds, subject_id, activity_type: "other", xp_earned: 0, gold_earned: 0 });
const milestone = (result, id) => result.milestones.find(milestone => milestone.id === id);

test("expanded milestones preserve the six original identities and exclude incomplete or invalid records", () => {
  const valid = session("exact", "2026-09-01T04:00:00Z", 3599);
  const records = [valid, valid, session("second", "2026-09-02T04:00:00Z", 1),
    { ...session("cancelled", "2026-09-03T04:00:00Z", 90000), status: "cancelled" },
    { ...session("running", "2026-09-03T04:00:00Z", 90000), status: "running" },
    session("zero", "2026-09-04T04:00:00Z", 0), session("negative", "2026-09-04T04:00:00Z", -1),
    session("invalid", "bad-date", 10), session("future", "2027-01-01T04:00:00Z", 90000),
    session("nan", "2026-09-04T04:00:00Z", NaN), session("infinite", "2026-09-04T04:00:00Z", Infinity)];
  const result = growth.earnedMilestones(records, "UTC", now);
  assert.equal(result.milestones.length, 18); assert.equal(new Set(result.milestones.map(m => m.id)).size, 18);
  for (const id of ["first", "return", "hour", "ten", "week", "tenhours"]) assert.ok(milestone(result, id));
  assert.equal(result.sessions, 2); assert.equal(result.seconds, 3600); assert.equal(result.days, 2);
  assert.equal(milestone(result, "hour").unlocked, true); assert.equal(milestone(result, "twentyfivehours").unlocked, false);
});

test("distinct focus-day milestones reward returning after breaks independently from longest streak", () => {
  const records = Array.from({ length: 15 }, (_, index) => session(String(index), new Date(Date.UTC(2026, 7, 1 + index * 2, 4)).toISOString()));
  records.push(session("same-day", records[0].completed_at));
  const result = growth.earnedMilestones(records, "Asia/Kuala_Lumpur", now);
  assert.equal(result.days, 15); assert.equal(result.bestStreak, 1);
  assert.equal(milestone(result, "fivedays").unlocked, true); assert.equal(milestone(result, "fifteendays").unlocked, true);
  assert.equal(milestone(result, "return").unlocked, false); assert.equal(milestone(result, "thirtydays").unlocked, false);
});

test("long-term milestones count saved focus-area identities and exact effort without assigning new categories", () => {
  const records = Array.from({ length: 100 }, (_, index) => session(String(index), new Date(Date.UTC(2026, 5, 1 + index, 4)).toISOString(), 3600, [42, 7, 91, 12][index % 4]));
  records.push(session("uncategorised", "2026-06-01T04:00:00Z", 1, null));
  const result = growth.earnedMilestones(records, "UTC", now);
  assert.equal(result.areas, 4); assert.equal(result.seconds, 360001); assert.equal(result.bestStreak, 100);
  assert.ok(result.milestones.every(m => m.unlocked)); assert.equal(growth.nextMilestone(result.milestones), null);
  assert.ok(records.every(row => row.xp_earned === 0), "display milestones do not award or mutate XP");
});

test("closest milestone uses progress across tracks and avoids recommending an already-earned badge", () => {
  const result = growth.earnedMilestones([session("short", "2026-09-01T04:00:00Z", 3599)], "UTC", now);
  assert.equal(growth.nextMilestone(result.milestones).id, "hour");
  assert.equal(milestone(result, "hour").unlocked, false);
  assert.equal(milestone(result, "hour").progress, 3599 / 3600);
});

const host = name => ({ children, ...props }) => React.createElement(name, props, children);
const text = node => typeof node === "string" ? node : (node.children ?? []).map(text).join("");
async function collection() {
  let profile = { id: "owner", timezone: "UTC", daily_goal_minutes: 60 };
  let data = { userId: "owner", areas: [], sessions: [session("first", "2026-09-01T04:00:00Z", 60)] };
  let error = false;
  const Screen = load("src/app/rewards.tsx", {
    "react-native": { View: host("View"), StyleSheet: { create: value => value, hairlineWidth: 1 }, AppState: { addEventListener: () => ({ remove() {} }) } },
    "@expo/vector-icons": { Ionicons: host("Icon") },
    "expo-router": { useFocusEffect: callback => React.useEffect(callback, [callback]) },
    "@gorhom/bottom-sheet": { BottomSheetScrollView: host("SheetScroll") },
    "../components/AppText": { Text: host("Text") },
    "../components/MotionPressable": host("Button"),
    "../components/AppSheet": props => React.createElement("Sheet", props, props.header, props.children),
    "../components/PersonalUI": { PersonalPage: host("Page"), PersonalButton: ({ title, ...props }) => React.createElement("Button", props, title), Meter: host("Meter"), p: {} },
    "../context/UserContext": { useUser: () => ({ profile }) },
    "../context/TimerContext": { useTimer: () => ({ sessionSummary: null }) },
    "../hooks/useCharacterData": { useCharacterData: () => ({ data: data?.userId === profile.id ? data : null, error, loading: false, refresh: async () => {} }) },
    "../services/dailyProgressService": { getTodayProgress: async () => null },
  }).default;
  let renderer; await act(async () => { renderer = create(React.createElement(Screen)); });
  return { renderer, text: () => text(renderer.root), update: async update => act(async () => { if (update.profile) profile = update.profile; if ("data" in update) data = update.data; if ("error" in update) error = update.error; renderer.update(React.createElement(Screen)); }), cleanup: async () => act(async () => renderer.unmount()) };
}

test("collection starts with one next milestone per track and expands intentionally without duplicating earned badges", async () => {
  const ui = await collection();
  const rows = () => ui.renderer.root.findAllByType("Button").filter(node => node.props.accessibilityLabel?.includes("View milestone"));
  try {
    assert.equal(rows().length, 6, "one earned tile and five upcoming tracks");
    assert.match(ui.text(), /WITHIN REACH/); assert.match(ui.text(), /1 of 18 earned/);
    await act(async () => ui.renderer.root.findAllByType("Button").find(node => node.props.accessibilityLabel === "Show all milestones").props.onPress());
    assert.equal(rows().length, 18); assert.equal(rows().filter(node => node.props.accessibilityLabel.startsWith("First step,")).length, 1);
    await act(async () => ui.renderer.root.findAllByType("Button").find(node => node.props.accessibilityLabel === "Show next milestones").props.onPress());
    assert.equal(rows().length, 6);
  } finally { await ui.cleanup(); }
});

test("open milestone details update from refreshed history and survive failed refresh until dismissal", async () => {
  const ui = await collection();
  try {
    const row = ui.renderer.root.findAllByType("Button").find(node => node.props.accessibilityLabel?.startsWith("An hour invested,"));
    await act(async () => row.props.onPress()); assert.match(text(ui.renderer.root.findByType("Sheet")), /You’re making progress/);
    await ui.update({ data: { userId: "owner", areas: [], sessions: [session("hour", "2026-09-01T04:00:00Z", 3600)] } });
    assert.match(text(ui.renderer.root.findByType("Sheet")), /Earned automatically/);
    await ui.update({ error: true }); assert.match(text(ui.renderer.root.findByType("Sheet")), /Earned automatically/);
    await act(async () => ui.renderer.root.findByType("Sheet").props.onRequestClose());
    assert.equal(ui.renderer.root.findByType("Sheet").props.visible, false); assert.match(text(ui.renderer.root.findByType("Sheet")), /Earned automatically/);
  } finally { await ui.cleanup(); }
});

test("changing accounts clears collection expansion and prior account milestone details", async () => {
  const ui = await collection();
  try {
    await act(async () => ui.renderer.root.findAllByType("Button").find(node => node.props.accessibilityLabel?.startsWith("First step,")).props.onPress());
    assert.equal(ui.renderer.root.findByType("Sheet").props.visible, true);
    await ui.update({ profile: { id: "other", timezone: "UTC", daily_goal_minutes: 30 } });
    assert.equal(ui.renderer.root.findByType("Sheet").props.visible, false); assert.doesNotMatch(ui.text(), /First step|Earned automatically\. Yours to keep/);
  } finally { await ui.cleanup(); }
});

test("today's goal remains the first card before and after milestone history arrives",async()=>{
 const ui=await collection();
 try{
  await ui.update({data:null});
  const page=ui.renderer.root.findByType('Page');
  const first=page.findAllByType('View').find(node=>node.props.testID==='milestones-daily-goal');
  assert.ok(first);assert.ok(ui.text().indexOf('TODAY’S GOAL')<ui.text().indexOf('Getting your collection ready'));
  await ui.update({data:{userId:'owner',areas:[],sessions:[session('hour','2026-09-01T04:00:00Z',3600)]}});
  assert.equal(page.findAllByType('View').find(node=>node.props.testID==='milestones-daily-goal'),first);
  assert.ok(ui.text().indexOf('TODAY’S GOAL')<ui.text().indexOf('WITHIN REACH'));
 }finally{await ui.cleanup();}
});

test('Profile history is immediately reused by Milestones while refresh stays account-scoped',async()=>{
 let owner='first',snapshot,pending=false,resolveAreas,resolveSessions;
 const hook=load('src/hooks/useCharacterData.ts',{
  'expo-router':{useFocusEffect:callback=>React.useEffect(callback,[callback])},
  'react-native':{AppState:{addEventListener:()=>({remove(){}})}},
  '../context/UserContext':{useUser:()=>({profile:{id:owner}})},
  '../context/TimerContext':{useTimer:()=>({sessionSummary:null})},
  '../utils/afterTransition':{afterTransition:callback=>{callback();return()=>{};}},
  '../services/progressService':{
   getProgressSubjects:()=>pending?new Promise(resolve=>{resolveAreas=resolve;}):Promise.resolve([{id:1,title:'Learning'}]),
   getCompletedSessions:()=>pending?new Promise(resolve=>{resolveSessions=resolve;}):Promise.resolve([session('first','2026-09-01T04:00:00Z')]),
  },
 }).useCharacterData;
 function Consumer(){snapshot=hook();return null;}
 let renderer;
 await act(async()=>{renderer=create(React.createElement(Consumer));});
 const saved=snapshot.data;assert.equal(saved.userId,'first');
 await act(async()=>renderer.unmount());pending=true;
 await act(async()=>{renderer=create(React.createElement(Consumer));});
 assert.equal(snapshot.data,saved);assert.equal(snapshot.loading,true);
 await act(async()=>renderer.unmount());owner='second';
 await act(async()=>{renderer=create(React.createElement(Consumer));});
 assert.equal(snapshot.data,null);
 await act(async()=>{resolveAreas([]);resolveSessions([]);});
 assert.equal(snapshot.data.userId,'second');
 await act(async()=>renderer.unmount());
});
