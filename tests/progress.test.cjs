const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  ts = require("typescript");
const React = require("react"),
  { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, "..", file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} };
  cache.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("require", "module", "exports", code)(
    (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.endsWith("/FeatureTour")) return {FeatureTourProvider: props=>props.children, TourAnchor: props=>props.children, TourScrollView: mocks["react-native"]?.ScrollView || (props=>React.createElement("ScrollView",props,props.children)), useFeatureTour:()=>({start(){}}), prepareFeatureTour:async()=>{}};
      if (name.endsWith("/DailyGoalSheet")) return props=>React.createElement("GoalSheet",props);
      if (name.endsWith("/MotionPressable")) return mocks["react-native"]?.Pressable || mocks["react-native"]?.TouchableOpacity || (props => React.createElement("Button", props, props.children));
      if (name.endsWith("/GlassSurface")) return props => React.createElement("View", {...props, testID:"glass-surface"});
      if (name.endsWith("/SlidingSelection")) return props => React.createElement("View", {...props, style:[props.style,{left:props.index === 0 ? "0%" : "50%"}]});
      if (name.endsWith("/ProgressRing")) return props => React.createElement("Ring", props, props.children);
      if (name === "expo-router/js-tabs") return {useBottomTabBarHeight: () => 90};
      { const study = require('./helpers/study-stubs.cjs')(name); if (study) return study; }
      if (!name.startsWith(".")) return require(name);
      const target = path.resolve(path.dirname(filename), name);
      const ext = ["", ".ts", ".tsx"].find((e) => fs.existsSync(target + e));
      return load(
        path.relative(path.resolve(__dirname, ".."), target + ext),
        mocks,
        cache,
      );
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}
const analytics = load("src/utils/progressAnalytics.ts");
const { periodFor, dateKey, shiftDay, buildProgress, durationLabel } =
  analytics;
const TZ = "Asia/Kuala_Lumpur",
  now = new Date("2026-10-03T10:00:00Z");
const session = (
  id,
  seconds,
  completed = "2026-10-03T08:00:00Z",
  area = 1,
) => ({
  id,
  duration_seconds: seconds,
  completed_at: completed,
  subject_id: area,
  activity_type: "other",
  xp_earned: 0,
  gold_earned: 0,
});
const areas = [{ id: 1, title: "Learning", color_code: "#A5B4FC" }];

test("local calendar arithmetic handles month boundaries, leap years and DST without moving the day", () => {
  assert.equal(dateKey(new Date("2026-10-02T18:00:00Z"), TZ), "2026-10-03");
  assert.equal(shiftDay("2024-02-28", 1), "2024-02-29");
  assert.equal(shiftDay("2024-02-29", 1), "2024-03-01");
  const week = periodFor("week", "2026-10-03", TZ, now);
  assert.equal(week.start, "2026-09-28");
  assert.equal(week.end, "2026-10-04");
  const dst = periodFor(
    "week",
    "2026-03-08",
    "America/New_York",
    new Date("2026-03-08T12:00:00Z"),
  );
  assert.equal(dst.start, "2026-03-02");
  assert.equal(dst.end, "2026-03-08");
  assert.equal(
    periodFor("month", "2024-02-12", TZ, new Date("2024-02-12T00:00:00Z")).end,
    "2024-02-29",
  );
});
test("exact seconds accumulate while saved daily-goal recognition stays separate", () => {
  const period = periodFor("week", "2026-10-03", TZ, now);
  const result = buildProgress(
    period,
    [
      session("a", 30),
      session("b", 959),
      session("c", 30, "2026-10-02T17:00:00Z"),
      session("future", 100, "2026-10-04T00:00:00Z"),
    ],
    [
      {
        progress_date: "2026-10-03",
        goal_minutes: 60,
        completed_minutes: 15,
        goal_completed: false,
      },
    ],
    TZ,
    areas,
    now,
  );
  assert.equal(result.seconds, 1019);
  assert.equal(durationLabel(result.seconds), "16m 59s");
  assert.equal(result.activeDays, 1);
  assert.equal(result.goalDays, 0);
  assert.equal(result.sessions.length, 3);
  assert.equal(result.days.at(-1).future, true);
  assert.equal(result.areas[0].seconds, 1019);
});

test("Progress and Profile count each completed saved session once and exclude ended rows", () => {
  const clock = new Date("2026-10-27T12:00:00Z");
  const kept = session("kept", 60, "2026-10-26T16:00:00Z"); // local midnight on the 27th
  const rows = [kept, { ...kept },
    session("previous-local-day", 20, "2026-10-26T15:59:59Z"),
    { ...session("ended", 900, "2026-10-27T08:00:00Z"), status: "abandoned" },
    { ...session("paused", 900, "2026-10-27T08:00:00Z"), status: "paused" },
    session("future", 900, "2026-10-28T08:00:00Z"),
    session("invalid", 900, "invalid-date"),
  ];
  const { earnedMilestones } = load("src/utils/characterGrowth.ts");
  const profile = earnedMilestones(rows, TZ, clock);
  for (const mode of ["week", "month"]) {
    const result = buildProgress(periodFor(mode, "2026-10-27", TZ, clock), rows, [], TZ, areas, clock);
    assert.equal(result.seconds, profile.seconds, `${mode}: Progress and Profile have the same saved effort`);
    assert.equal(result.sessions.length, 2);
    assert.equal(result.days.find(day => day.key === "2026-10-27").seconds, 60);
    assert.equal(result.days.find(day => day.key === "2026-10-26").seconds, 20);
    assert.equal(result.areas[0].seconds, 80);
    assert.equal(result.areas[0].sessions.length, 2);
  }
});

test("reported day, week, month and Profile totals reconcile without dropping historical seconds", () => {
  const clock = new Date("2026-10-27T12:00:00Z");
  const areaRows = [{ id: 1, title: "General" }, { id: 2, title: "Wellbeing" }];
  const rows = [
    ...[60, 120, 120, 60].map((seconds, i) => session(`today-${i}`, seconds, `2026-10-27T0${i + 1}:00:00Z`)),
    ...[60, 120, 20].map((seconds, i) => session(`yesterday-${i}`, seconds, `2026-10-26T0${i + 1}:00:00Z`)),
    session("yesterday-wellbeing", 2700, "2026-10-26T08:00:00Z", 2),
    session("sunday-wellbeing", 2700, "2026-10-25T08:00:00Z", 2),
  ];
  const { earnedMilestones } = load("src/utils/characterGrowth.ts");
  const { focusAreaDetail } = load("src/utils/focusAreaDetail.ts");
  const { creditedDailySeconds } = load("src/utils/progressionAccounting.ts");
  const { dailyGoalRatio } = load("src/utils/dailyGoalPresentation.ts");
  const goals = [{ progress_date: "2026-10-27", goal_minutes: 30, completed_minutes: 6,
    completed_seconds: 360, credit_version: 1, goal_completed: false }];
  const week = buildProgress(periodFor("week", "2026-10-27", TZ, clock), rows, goals, TZ, areaRows, clock);
  const month = buildProgress(periodFor("month", "2026-10-27", TZ, clock), rows, goals, TZ, areaRows, clock);
  const day = week.days.find(day => day.key === "2026-10-27");
  assert.equal(day.seconds, 360); assert.equal(day.sessions.length, 4);
  assert.equal(dailyGoalRatio(creditedDailySeconds(day.goal), day.goal.goal_minutes), "6 / 30 min", "the saved day's target governs its goal credit");
  assert.equal(week.seconds, 3260); assert.equal(month.seconds, 5960);
  const profile = earnedMilestones(rows, TZ, clock);
  assert.equal(profile.seconds, month.seconds); assert.equal(profile.days, 3); assert.equal(profile.bestStreak, 3);
  assert.equal(profile.sessions, 9);
  const general = focusAreaDetail(areaRows[0], areaRows, rows, TZ, clock);
  assert.equal(general.seconds, 560); assert.equal(general.weekSeconds, 560);
  assert.equal(general.days.find(day => day.day === "2026-10-27").seconds, day.seconds);
  const wellbeing = focusAreaDetail(areaRows[1], areaRows, rows, TZ, clock);
  assert.equal(wellbeing.weekSeconds, 2700); assert.equal(wellbeing.seconds, 5400);
  assert.equal(general.seconds + wellbeing.seconds, profile.seconds);
});
test("period-to-date comparison excludes later days of the previous period", () => {
  const period = periodFor("month", "2026-10-03", TZ, now);
  const result = buildProgress(
    period,
    [
      session("a", 100),
      session("b", 60, "2026-09-03T08:00:00Z"),
      session("c", 900, "2026-09-04T08:00:00Z"),
    ],
    [],
    TZ,
    areas,
    now,
  );
  assert.equal(result.previousSeconds, 60);
  assert.equal(result.comparisonDays, 3);
  assert.equal(result.previousCutoff, "2026-09-03");
  const march = periodFor("month", "2026-03-01", TZ, now);
  const full = buildProgress(
    march,
    [
      session("a", 100, "2026-03-30T08:00:00Z"),
      session("b", 60, "2026-03-25T08:00:00Z"),
    ],
    [],
    TZ,
    areas,
    now,
  );
  assert.equal(full.seconds, 160);
  assert.equal(full.comparisonSeconds, 60);
  assert.equal(full.comparisonDays, 28);
});
test("area groups retain legacy labels and reject unsafe chart colors", () => {
  const period = periodFor("week", "2026-10-03", TZ, now);
  const result = buildProgress(
    period,
    [
      session("a", 30),
      { ...session("b", 60, undefined, null), activity_type: "study" },
    ],
    [],
    TZ,
    [{ id: 1, title: "Learning", color_code: "red;garbage" }],
    now,
  );
  assert.equal(
    result.areas.find((a) => a.title === "Learning").color,
    "#B4651E",
  );
  assert.equal(result.areas.length, 2);
  assert.equal(durationLabel(30), "30s");
  assert.equal(durationLabel(3600), "1h");
});

test("legacy Wellbeing aliases form one 16-minute group with both original sessions in Week and Month", () => {
  const clock = new Date("2026-10-17T08:00:00Z");
  const areaRows = Object.freeze([
    Object.freeze({ id: 2, title: "Grooming & Vitality", color_code: "#EC4899" }),
    Object.freeze({ id: 3, title: "Fitness & Health", color_code: "#EF4444" }),
  ]);
  const rows = Object.freeze([
    Object.freeze(session("grooming", 60, "2026-10-17T07:00:00Z", 2)),
    ...Array.from({ length: 15 }, (_, index) => Object.freeze(session(`fitness-${index}`, 60, "2026-10-17T06:00:00Z", 3))),
  ]);
  const before = JSON.stringify({ areaRows, rows });
  for (const mode of ["week", "month"]) {
    const result = buildProgress(periodFor(mode, "2026-10-17", TZ, clock), rows, [], TZ, areaRows, clock);
    assert.equal(result.seconds, 960);
    assert.equal(result.areas.length, 1);
    const group = result.areas[0];
    assert.equal(group.title, "Wellbeing");
    assert.equal(group.seconds, 960);
    assert.equal(group.color, "#B4651E");
    assert.equal(group.sessions.length, 16);
    assert.equal(new Set(group.sessions.map(row => row.id)).size, 16);
    assert.equal(group.sessions.filter(row => row.subject_id === 2).length, 1);
    assert.equal(group.sessions.filter(row => row.subject_id === 3).length, 15);
    assert.ok(group.sessions.every(row => rows.includes(row)), "drilldown retains the original saved sessions");
  }
  assert.equal(JSON.stringify({ areaRows, rows }), before, "analytics must not rewrite source rows or credit values");
});

test("alias daily segments use the same stable colour and identity as the combined period", () => {
  const clock = new Date("2026-10-17T08:00:00Z");
  const areaRows = [
    { id: 2, title: "Grooming & Vitality", color_code: "#EC4899" },
    { id: 3, title: "Fitness & Health", color_code: "#EF4444" },
    { id: 8, title: "Wellbeing", color_code: "#FF9F0A" },
  ];
  const rows = [session("grooming", 60, "2026-10-17T07:00:00Z", 2),
    session("fitness", 900, "2026-10-16T07:00:00Z", 3), session("canonical", 120, "2026-10-17T06:00:00Z", 8)];
  const result = buildProgress(periodFor("month", "2026-10-17", TZ, clock), rows, [], TZ, areaRows, clock);
  assert.equal(result.areas.length, 1);
  assert.equal(result.areas[0].seconds, 1080);
  for (const day of result.days.filter(day => day.seconds)) {
    const segments = analytics.sessionAreaSegments(day.sessions, areaRows);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].seconds, day.seconds);
    assert.equal(segments[0].key, result.areas[0].key);
    assert.equal(segments[0].color, result.areas[0].color);
  }
  assert.deepEqual(analytics.sessionAreaSegments(rows, [...areaRows].reverse()), analytics.sessionAreaSegments(rows, areaRows));
});

test("distinct custom IDs and legacy activities remain separate while single-area colours stay unchanged", () => {
  const clock = new Date("2026-10-17T08:00:00Z");
  const areaRows = [
    { id: 1, title: "Learning", color_code: "#A5B4FC" },
    { id: 6, title: "My ceramics", color_code: "#64D2FF" },
    { id: 7, title: "My ceramics", color_code: "#FF6482" },
    { id: 1, title: "Learning", color_code: "#A5B4FC" },
  ];
  const rows = [session("learning", 60, "2026-10-17T07:00:00Z", 1),
    session("custom-one", 120, "2026-10-17T07:00:00Z", 6), session("custom-two", 180, "2026-10-17T07:00:00Z", 7),
    { ...session("legacy", 30, "2026-10-17T07:00:00Z", null), activity_type: "study" }];
  const result = buildProgress(periodFor("month", "2026-10-17", TZ, clock), rows, [], TZ, areaRows, clock);
  assert.equal(result.seconds, 390);
  assert.equal(result.areas.length, 4);
  assert.equal(result.areas.filter(area => area.title === "My ceramics").length, 2);
  assert.equal(new Set(result.areas.map(area => area.key)).size, 4);
  assert.equal(result.areas.find(area => area.title === "Learning").color, "#2E6A9E");
  assert.equal(analytics.sessionAreaSegments(rows, areaRows).length, 4);
});

function serviceHarness(respond) {
  const calls = [];
  const supabase = {
    from(table) {
      const state = { table, filters: [] };
      const query = {};
      for (const method of [
        "select",
        "is",
        "limit",
        "eq",
        "gte",
        "lte",
        "gt",
        "lt",
        "order",
        "range",
      ])
        query[method] = (...args) => {
          state.filters.push([method, ...args]);
          if (method === "range") state.range = args;
          return query;
        };
      query.then = (resolve, reject) => {
        calls.push(state);
        return Promise.resolve(respond(state)).then(resolve, reject);
      };
      return query;
    },
  };
  return {
    calls,
    service: load("src/services/progressService.ts", {
      "../../lib/supabase": { supabase },
    }),
  };
}
test("period queries paginate beyond the server row limit and apply upper bounds", async () => {
  const { calls, service } = serviceHarness((s) => ({
    data:
      s.range[0] === 0
        ? Array.from({ length: 500 }, (_, i) => session(String(i), 30))
        : [session("last", 45)],
    error: null,
  }));
  const rows = await service.getCompletedSessions("2026-09-01", "2026-11-01");
  assert.equal(rows.length, 501);
  assert.deepEqual(calls[1].range, [500, 999]);
  assert.ok(
    calls[0].filters.some((f) => f[0] === "lt" && f[2] === "2026-11-01"),
  );
  assert.deepEqual(
    calls[0].filters.filter((f) => f[0] === "order").map((f) => f[1]),
    ["completed_at", "id"],
  );
});
test("focus streak crosses duplicate-day pages and counts sub-minute sessions", async () => {
  const { service } = serviceHarness((s) => ({
    data:
      s.range[0] === 0
        ? Array.from({ length: 500 }, (_, i) => session(String(i), 30))
        : [
            session("yesterday", 30, "2026-10-02T08:00:00Z"),
            session("before", 30, "2026-10-01T08:00:00Z"),
            session("gap", 30, "2026-09-29T08:00:00Z"),
          ],
    error: null,
  }));
  assert.equal(await service.getFocusStreak(TZ, now), 3);
  const yesterday = serviceHarness(() => ({
    data: [session("a", 30, "2026-10-02T08:00:00Z")],
    error: null,
  }));
  assert.equal(await yesterday.service.getFocusStreak(TZ, now), 1);
  const broken = serviceHarness(() => ({
    data: [session("a", 30, "2026-10-01T08:00:00Z")],
    error: null,
  }));
  assert.equal(await broken.service.getFocusStreak(TZ, now), 0);
});
test("query failures are actionable and never silently produce empty history", async () => {
  const { service } = serviceHarness(() => ({
    data: null,
    error: Error("Offline"),
  }));
  await assert.rejects(service.getCompletedSessions("2026-09-01"), /Offline/);
  await assert.rejects(
    service.getProgressGoals("2026-09-01", "2026-09-30"),
    /Offline/,
  );
  await assert.rejects(
    service.getSessionHistory(0, now.toISOString()),
    /Offline/,
  );
});

test("longest Focus streak spans the full history rather than only the current week", async () => {
  const {service,calls}=serviceHarness(query=>({data:query.range[0]===0?Array.from({length:500},(_,i)=>session('same-day-'+i,1,'2026-10-03T08:00:00Z')):[
    ...Array.from({length:6},(_,i)=>session('older-'+i,1,`2026-09-${String(10+i).padStart(2,'0')}T08:00:00Z`)),
    session('zero',0,'2026-09-16T08:00:00Z'),session('future',60,'2027-01-01T08:00:00Z')],error:null}));
  assert.equal(await service.getLongestFocusStreak(TZ,now),6);assert.equal(calls.length,2);
});
test("history pagination uses a stable completion snapshot", async () => {
  const { service, calls } = serviceHarness(() => ({
    data: Array.from({ length: 50 }, (_, i) => session(String(i), 30)),
    error: null,
  }));
  const result = await service.getSessionHistory(50, now.toISOString());
  assert.equal(result.hasMore, true);
  assert.deepEqual(calls[0].range, [50, 99]);
  assert.ok(
    calls[0].filters.some((f) => f[0] === "lte" && f[2] === now.toISOString()),
  );
});

test("Progress rejects stale requests, preserves same-period data on failure and refreshes after completion", async () => {
  let value,
    foreground,
    failures = false;
  const requests = [];
  const { useProgressData } = load("src/hooks/useProgressData.ts", {
    "expo-router": { useFocusEffect: (fn) => React.useEffect(fn, [fn]) },
    "react-native": {
      AppState: {
        addEventListener: (_, fn) => {
          foreground = fn;
          return { remove() {} };
        },
      },
    },
    "../services/progressService": {
      getCompletedSessions: () =>
        failures
          ? Promise.reject(Error("Offline"))
          : new Promise((resolve) => requests.push(resolve)),
      getProgressGoals: async () => [],
      getProgressSubjects: async () => areas,
      getFocusStreak: async () => 2, getLongestFocusStreak: async () => 5,
    },
  });
  function Capture({ anchor, completion }) {
    value = useProgressData(periodFor("week", anchor, TZ, now), TZ, completion);
    return null;
  }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Capture, { anchor: "2026-10-03" }));
  });
  await act(async () =>
    renderer.update(React.createElement(Capture, { anchor: "2026-09-20" })),
  );
  await act(async () => requests[1]([session("new", 60)]));
  assert.equal(value.data.sessions[0].id, "new");
  await act(async () => requests[0]([session("stale", 60)]));
  assert.equal(value.data.sessions[0].id, "new");
  failures = true;
  await act(async () => foreground("active"));
  assert.equal(value.error, true);
  assert.equal(value.data.sessions[0].id, "new");
  failures = false;
  await act(async () =>
    renderer.update(
      React.createElement(Capture, { anchor: "2026-09-20", completion: {} }),
    ),
  );
  await act(async () => requests[2]([session("complete", 90)]));
  assert.equal(value.error, false);
  assert.equal(value.data.sessions[0].id, "complete");
  await act(async () => renderer.unmount());
});

test("returning to Progress reuses fresh data; off-tab completion invalidates the cache", async () => {
  let value, focus, blur, calls = 0;
  const { useProgressData } = load("src/hooks/useProgressData.ts", {
    "expo-router": { useFocusEffect: fn => React.useEffect(() => { focus = fn; blur = fn(); return blur; }, [fn]) },
    "react-native": { AppState: { addEventListener: () => ({ remove() {} }) } },
    "../services/progressService": {
      getCompletedSessions: async () => { calls++; return [session("saved", 60)]; },
      getProgressGoals: async () => [], getProgressSubjects: async () => areas, getFocusStreak: async () => 2, getLongestFocusStreak: async () => 5,
    },
  });
  function Capture({ completion }) {
    value = useProgressData(periodFor("week", "2026-10-03", TZ, now), TZ, completion);
    return null;
  }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Capture)); });
  try {
    assert.equal(calls, 1);
    await act(async () => { blur(); blur = focus(); });
    assert.equal(calls, 1);
    assert.equal(value.loading, false);
    assert.equal(value.data.sessions[0].id, "saved");
    blur();
    await act(async () => renderer.update(React.createElement(Capture, { completion: { id: "new" } })));
    assert.equal(calls, 1);
    await act(async () => { blur = focus(); });
    assert.equal(calls, 2);
    assert.equal(value.data.sessions[0].id, "saved");
  } finally { await act(async () => renderer.unmount()); }
});

const host = (name) => (props) =>
  React.createElement(name, props, props.children);
async function screenHarness({ empty = false, historyFailure = false, sessionRows, areaRows, hapticsEnabled = false, offline = false, history = null, overview = false } = {}) {
  const today = dateKey(new Date(), TZ),
    stamp = new Date(Date.now() - 1000).toISOString();
  let refreshes = 0,
    haptics = 0,
    historyCalls = 0;
  let progressStyles;
  const Native = {
    View: host("View"),
    Text: host("Text"),
    Pressable: host("Button"),
    ScrollView: host("Scroll"),
    RefreshControl: host("Refresh"),
    ActivityIndicator: host("Spinner"),
    StyleSheet: { create: (s) => { if (s.chart) progressStyles = s; return s; } },
    AppState: { addEventListener: () => ({ remove() {} }) },
    Animated: {
      Value: class {
        stopAnimation() {}
        setValue() {}
      },
      View: host("Animated"),
      timing: () => ({ start() {}, stop() {} }),
    },
  };
  const screen = load("src/app/(tabs)/progress.tsx", {
    "expo-router": { useRouter: () => ({ navigate() {} }) },
    "react-native": Native,
    "@expo/vector-icons": { Ionicons: host("Icon") },
    "@gorhom/bottom-sheet": {
      BottomSheetScrollView: host("SheetScroll"),
      TouchableOpacity: host("Button"),
    },
    "expo-haptics": {
      selectionAsync: async () => {
        haptics++;
      },
    },
    "react-native-safe-area-context": {
      SafeAreaView: host("Safe"),
      useSafeAreaInsets: () => ({ bottom: 20 }),
    },
    "../../components/AppSheet": (props) =>
      React.createElement(
        "Sheet",
        props,
        props.visible ? [props.header, props.children] : null,
      ),
    "../../context/AuthContext": { useAuth: () => ({ accessMode: offline ? "local-only" : "online" }) },
    "../../context/UserContext": {
      useUser: () => ({
        profile: { timezone: TZ, level: 2 },
        hapticsEnabled,
      }),
    },
    "../../context/TimerContext": {
      useTimer: () => ({ sessionSummary: null }),
    },
    "../../hooks/useReducedMotion": { useReducedMotion: () => true },
    "../hooks/useReducedMotion": { useReducedMotion: () => true },
    // All-time history for the quiet markers; none unless a test passes it.
    "../../hooks/useCharacterData": { useCharacterData: () => ({ data: history ?? null }) },
    "../../hooks/useProgressData": {
      useProgressData: (period) => ({
        data: {
          key: period.start,
          sessions: empty ? [] : sessionRows ?? [session("a", 30, stamp)],
          goals: [],
          areas: areaRows ?? areas,
          streak: empty ? 0 : 2,
        },
        loading: false,
        error: false,
        refresh: async () => {
          refreshes++;
        },
      }),
    },
    "../../services/progressService": {
      getSessionHistory: async () => {
        historyCalls++;
        if (historyFailure) throw Error("Offline");
        return { sessions: [session("historic", 60, stamp)], hasMore: false };
      },
    },
  }).default;
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(screen));
  });
  // Round 85: the page opens on this week's overview (mockup 08). The detailed
  // charts these tests cover sit one tap away, under History.
  if (!overview) {
    const open = renderer.root.findAllByType("Button").find(b => b.props.testID === "rhythm-history");
    assert.ok(open, "History opens the detailed charts");
    await act(async () => open.props.onPress());
    haptics = 0;
  }
  const text = (node) =>
    typeof node === "string" ? node : (node.children ?? []).map(text).join("");
  const buttons = () => renderer.root.findAllByType("Button");
  return {
    today,
    styles: () => progressStyles,
    renderer,
    text: () => text(renderer.root),
    historyCalls: () => historyCalls,
    haptics: () => haptics,
    press: async (label) => {
      const b = buttons().find(
        (b) => b.props.accessibilityLabel === label || text(b) === label,
      );
      assert.ok(b, label);
      await act(async () => b.props.onPress());
    },
    cleanup: async () => act(async () => renderer.unmount()),
  };
}
test("Progress uses one selected period and shared animated sheet for drilldowns", async () => {
  const ui = await screenHarness();
  try {
    assert.match(ui.text(), /30s/);
    assert.match(ui.text(), /2-day streak/);
    await ui.press("Month view");
    assert.ok(
      ui.renderer.root
        .findAllByType("Button")
        .find((b) => b.props.accessibilityLabel === "Previous month"),
    );
    await ui.press("How it works");
    assert.equal(ui.renderer.root.findByType("Sheet").props.visible, true);
    assert.match(ui.text(), /30-second session counts/);
    await act(async () =>
      ui.renderer.root.findByType("Sheet").props.onRequestClose(),
    );
    assert.equal(ui.renderer.root.findByType("Sheet").props.visible, false);
    assert.equal(ui.haptics(), 0);
  } finally {
    await ui.cleanup();
  }
});
test("selected-period session details retain the period and do not mutate rewards", async () => {
  const ui = await screenHarness();
  try {
    assert.equal(ui.historyCalls(), 0);
    await ui.press("Categories for selected week");
    assert.equal(ui.historyCalls(), 0);
    // Sessions open from their category, grouped by day.
    const card = ui.renderer.root.findByProps({ testID: "progress-categories" }).findAllByType("Button").find(b => b.props.accessibilityLabel?.endsWith("View sessions"));
    await act(async () => card.props.onPress());
    const row = ui.renderer.root
      .findAllByType("Button")
      .find(
        (b) =>
          b.props.accessibilityLabel?.includes("30s,") &&
          b.props.accessibilityLabel?.endsWith("View session"),
      );
    await act(async () => row.props.onPress());
    assert.match(ui.text(), /already saved/);
    await ui.press("Back to sessions");
    assert.ok(ui.renderer.root.findByType("Sheet").findAllByType("Button").some(b => b.props.accessibilityLabel?.includes("30s,")), "back to the same category list");
    assert.equal(ui.renderer.root.findAllByType("Button").some(b=>b.props.accessibilityLabel==="View all session history"),false);
  } finally {
    await ui.cleanup();
  }
});
test("empty Progress welcomes a fresh week instead of a page of empty sections", async () => {
  const ui = await screenHarness({ empty: true });
  try {
    assert.match(ui.text(), /A fresh week/);
    assert.match(ui.text(), /Even 15 minutes counts/);
    assert.ok(!ui.renderer.root.findAllByType("Button").some(b => b.props.accessibilityLabel === "Start a session from Home"), "no button that only goes back to Home");
    assert.doesNotMatch(ui.text(), /Room to grow|No completed sessions|By category/);
    assert.equal(ui.historyCalls(), 0);
  } finally {
    await ui.cleanup();
  }
});

test("an empty day still opens its own drilldown", async () => {
  const ui = await screenHarness({ empty: true, historyFailure: true });
  try {
    const day = ui.renderer.root
      .findAllByType("Button")
      .find((b) => b.props.accessibilityLabel?.includes("no sessions"));
    await act(async () => day.props.onPress());
    if (!ui.renderer.root.findByType("Sheet").props.visible) {
      const selectedDay = ui.renderer.root.findAllByType("Button").find((button) =>
        button.props.testID === day.props.testID);
      await act(async () => selectedDay.props.onPress());
    }
    assert.equal(ui.renderer.root.findByType("Sheet").props.visible, true);
    assert.match(ui.text(), /No completed sessions/);
  } finally {
    await ui.cleanup();
  }
});


test("compact Progress keeps the chart before allocation and opens area drilldowns", async()=>{
  const ui=await screenHarness();
  try {
    const text=ui.text();
    assert.ok(text.indexOf("30s") < text.indexOf("Goal reached"));
    assert.ok(text.indexOf("Goal reached") < text.indexOf("By category"));
    assert.equal(ui.renderer.root.findAllByProps({ testID: "progress-session-list" }).length, 0, "no separate Sessions list; sessions open from a category");
    const area=ui.renderer.root.findAllByType("Button").find(n=>n.props.accessibilityLabel?.endsWith("View sessions"));
    assert.ok(area);
    await act(async()=>area.props.onPress());
    assert.equal(ui.renderer.root.findByType("Sheet").props.visible,true);
    assert.ok(ui.renderer.root.findAllByType("Button").some(n=>n.props.accessibilityLabel?.endsWith("View session")));
  } finally { await ui.cleanup(); }
});


test("Progress chart uses a compact first-screen layout budget", async()=>{
  const ui=await screenHarness();
  try {
    const s=ui.styles();
    // Structural budget for default text, not a native layout/animation measurement.
    // Includes two comparison lines on a narrow phone.
    // The shared 64pt AppHeader sits above the page.
    const aboveChart = s.page.paddingTop + 64
      + s.segmentButton.minHeight + s.card.paddingVertical + s.story.paddingTop + s.storyLabel.lineHeight
      + s.storyValue.lineHeight + s.storyLine.lineHeight * 2 + s.story.paddingBottom;
    const chart = s.chart.paddingTop + s.barTrack.height + s.barTrack.marginBottom + Math.ceil(s.dayLabel.fontSize * 1.3)
      + s.dayStatus.height + s.dayStatus.marginTop + s.legend.marginTop + s.caption.lineHeight;
    assert.ok(aboveChart + chart < 440, `chart budget ${aboveChart + chart}px`);
    assert.equal(s.periodNav.paddingVertical, undefined);
  } finally { await ui.cleanup(); }
});


test("mixed Life areas retain proportional colours in a day instead of becoming the dominant area", async () => {
  const stamp = new Date(Date.now() - 1000).toISOString();
  const ui = await screenHarness({
    sessionRows: [session("general", 60, stamp, 2), session("knowledge", 60, stamp, 1)],
    areaRows: [{ id: 2, title: "General", color_code: "#F29D82" }, { id: 1, title: "Knowledge", color_code: "#B7ABEC" }],
  });
  try {
    const segments = ui.renderer.root.findAllByType("View").filter(node => node.props.testID?.startsWith(`focus-segment-${ui.today}`));
    assert.equal(segments.length, 2);
    assert.deepEqual(segments.map(node => [node.props.style.backgroundColor, node.props.style.flex]).sort(), [["#2E6A9E", 60], ["#B4651E", 60]]);
    await ui.press("Categories for selected week");
    assert.equal(ui.historyCalls(), 0, "period entry must not query unrelated dates");
    const cards = ui.renderer.root.findByProps({ testID: "progress-categories" }).findAllByType("Button").filter(node => node.props.accessibilityLabel?.endsWith("View sessions"));
    assert.equal(cards.length, 2, "each area keeps its own card");
  } finally { await ui.cleanup(); }
});
test("Month By category opens both legacy Wellbeing sessions from one combined row", async () => {
  const stamp = new Date(Date.now() - 1000).toISOString();
  const ui = await screenHarness({
    sessionRows: [session("grooming", 60, stamp, 2), session("fitness", 900, stamp, 3)],
    areaRows: [{ id: 2, title: "Grooming & Vitality", color_code: "#EC4899" },
      { id: 3, title: "Fitness & Health", color_code: "#EF4444" }],
  });
  try {
    await ui.press("Month view");
    const areaRows = ui.renderer.root.findAllByType("Button").filter(node => node.props.accessibilityLabel?.endsWith(". View sessions"));
    assert.deepEqual(areaRows.map(row => row.props.accessibilityLabel), ["Wellbeing, 16m. View sessions"]);
    await ui.press("Wellbeing, 16m. View sessions");
    const rows = ui.renderer.root.findByType("Sheet").findAllByType("Button").filter(node => node.props.accessibilityLabel?.endsWith("View session"));
    assert.equal(rows.length, 2);
    assert.ok(rows.some(row => row.props.accessibilityLabel.includes("15m,")));
    assert.ok(rows.some(row => row.props.accessibilityLabel.includes("1m,")));
    assert.equal(ui.historyCalls(), 0);
  } finally { await ui.cleanup(); }
});

test("empty selected period has no all-history escape or unbounded query", async () => {
  const ui = await screenHarness({ empty: true });
  try {
    assert.equal(ui.renderer.root.findAllByType("Button").some(b=>b.props.accessibilityLabel==="View sessions in selected period"),false);
    assert.equal(ui.renderer.root.findAllByType("Button").some(b=>b.props.accessibilityLabel==="View all session history"),false);
    assert.equal(ui.historyCalls(), 0);
  } finally { await ui.cleanup(); }
});

test("week and month session lists exclude comparison dates and unrelated historical months",async()=>{
 const today=dateKey(new Date(),TZ),week=periodFor('week',today,TZ),month=periodFor('month',today,TZ);
 const previousWeek=shiftDay(week.start,-1),previousMonth=shiftDay(month.start,-1);
 const rows=[session('current',60,new Date(Date.now()-1000).toISOString()),session('comparison',120,previousWeek+'T04:00:00Z'),session('old-month',180,previousMonth+'T04:00:00Z')];
 const ui=await screenHarness({sessionRows:rows});
 const cards=()=>ui.renderer.root.findByProps({testID:'progress-categories'}).findAllByType('Button').filter(b=>b.props.accessibilityLabel?.endsWith('View sessions')).map(b=>b.props.accessibilityLabel);
 try{
  await ui.press('Categories for selected week');assert.equal(cards().length,1);assert.match(cards()[0],/, 1m\. View sessions$/,'only this week');assert.doesNotMatch(ui.text(),/View all history/);
  await ui.press('Month view');await ui.press('Categories for selected month');
  assert.match(cards()[0],previousWeek>=month.start?/, 3m\. View sessions$/:/, 1m\. View sessions$/);assert.ok(cards().every(label=>!label.includes('6m')),'never the previous month');assert.equal(ui.historyCalls(),0);
 }finally{await ui.cleanup();}
});
test("local Monday week rollover excludes Sunday while month retains both dates", () => {
  const clock = new Date("2026-10-04T16:31:00Z");
  const rows = [session("sunday", 60, "2026-10-04T15:00:00Z"), session("monday", 60, "2026-10-04T16:10:00Z")];
  const week = buildProgress(periodFor("week", "2026-10-05", TZ, clock), rows, [], TZ, areas, clock);
  const month = buildProgress(periodFor("month", "2026-10-05", TZ, clock), rows, [], TZ, areas, clock);
  assert.deepEqual(week.sessions.map(row => row.id), ["monday"]);
  assert.equal(week.seconds, 60);
  assert.equal(month.seconds, 120);
});

test('Week and Month use identical label/button geometry and one separate selection surface',async()=>{
  const ui=await screenHarness();
  try {
    const buttons=()=>ui.renderer.root.findAllByType('Button').filter(node=>['Week view','Month view'].includes(node.props.accessibilityLabel));
    assert.equal(buttons().length,2);
    assert.deepEqual(buttons()[0].props.style,buttons()[1].props.style);
    assert.equal(buttons()[0].findAllByType('View').length,0);
    assert.equal(buttons()[1].findAllByType('View').length,0);
    const labels=buttons().map(node=>node.findByType('Text'));
    assert.deepEqual(labels[0].props.style[1][0],labels[1].props.style[1][0]);
    const track=ui.renderer.root.findByProps({testID:'period-track'});
    assert.equal(track.props.style.height,36);
    assert.equal(track.props.style.overflow,'hidden');
    assert.equal(track.findAllByType('View').find(node=>node.props.testID==='period-selection').props.style[0].top,0);
    assert.equal(track.findAllByType('View').find(node=>node.props.testID==='period-selection').props.style[0].bottom,0);
    assert.equal(track.findAllByType('View').find(node=>node.props.testID==='period-selection').props.style[1].left,'0%');
    await act(async()=>buttons()[1].props.onPress());
    assert.equal(ui.renderer.root.findAllByType('View').find(node=>node.props.testID==='period-selection').props.style[1].left,'50%');
    assert.deepEqual(buttons()[0].props.style,buttons()[1].props.style);
  } finally {await ui.cleanup();}
});

test("Quick Start history is bounded, owner filtered and excludes quests, tiny sessions and future completions", async () => {
  const row = {...session("free", 1859), task_id: null};
  const {service, calls} = serviceHarness(() => ({data:[row], error:null}));
  assert.deepEqual(await service.getLastFreeSession("owner-a", now), row);
  const filters = calls[0].filters;
  for (const expected of [["eq","user_id","owner-a"],["eq","status","completed"],["is","task_id",null],["gte","duration_seconds",300],["lte","duration_seconds",28800],["lte","completed_at",now.toISOString()],["limit",1]]) {
    assert.ok(filters.some(filter => JSON.stringify(filter) === JSON.stringify(expected)));
  }
  assert.equal(await serviceHarness(() => ({data:[],error:null})).service.getLastFreeSession("owner-b",now), null);
  await assert.rejects(serviceHarness(() => ({error:Error("Offline")})).service.getLastFreeSession("owner-a",now), /Offline/);
});

test("Progress shows the analytics with no milestones and no squads",async()=>{
 const ui=await screenHarness();try{
  const text=ui.text();assert.doesNotMatch(text,/My Milestones|My Squad|Keep growing at your pace/);
  assert.match(text,/Consistency/);
 }finally{await ui.cleanup();}
});

test("a new local week compares the same clock time and does not discourage a first session", () => {
  const clock = new Date("2026-10-11T17:00:00Z"); // Monday, 01:00 in the account zone.
  const period = periodFor("week", "2026-10-12", TZ, clock);
  const result = buildProgress(period, [
    session("today", 120, "2026-10-11T16:45:00Z"),
    session("previous-early", 300, "2026-10-04T16:30:00Z"),
    session("previous-later", 1800, "2026-10-05T13:00:00Z"),
  ], [], TZ, areas, clock);
  assert.equal(result.seconds, 120);
  assert.equal(result.previousSeconds, 300, "previous Monday evening cannot count against Monday morning");
  assert.equal(result.comparisonDays, 1);
  assert.equal(result.partialPeriod, true);
  assert.match(analytics.progressPeriodMessage(result, period), /A new week, one session finished/);
  assert.doesNotMatch(analytics.progressPeriodMessage(result, period), /less|%|focus time/);
});

test("an unfinished period suppresses negative percentages and uses only previous matching local hours", () => {
  const clock = new Date("2026-10-13T02:00:00Z"); // Tuesday, 10:00 local.
  const period = periodFor("week", "2026-10-13", TZ, clock);
  const result = buildProgress(period, [
    session("monday", 120, "2026-10-12T01:00:00Z"),
    session("tuesday", 60, "2026-10-13T01:00:00Z"),
    session("previous-monday", 60, "2026-10-05T13:00:00Z"),
    session("previous-tuesday-morning", 300, "2026-10-06T01:00:00Z"),
    session("previous-tuesday-later", 900, "2026-10-06T03:00:00Z"),
  ], [], TZ, areas, clock);
  assert.equal(result.previousSeconds, 360);
  assert.equal(result.comparisonSeconds, 180);
  assert.match(analytics.progressPeriodMessage(result, period), /2 sessions finished across 2 days/);
  assert.doesNotMatch(analytics.progressPeriodMessage(result, period), /less|%/);
});

test("completed periods may compare saved effort but never use a tiny earlier sample for percentages", () => {
  const period = periodFor("week", "2026-10-05", TZ, new Date("2026-10-12T03:00:00Z"));
  const result = buildProgress(period, [
    session("current", 300, "2026-10-05T13:00:00Z"),
    session("previous", 600, "2026-09-28T13:00:00Z"),
  ], [], TZ, areas, new Date("2026-10-12T03:00:00Z"));
  assert.equal(result.partialPeriod, false);
  assert.match(analytics.progressPeriodMessage(result, period), /50% less recorded effort/);
  const tiny = { ...result, previousSeconds: 60 };
  assert.doesNotMatch(analytics.progressPeriodMessage(tiny, period), /%/);
});

test("comparison uses account-local clock times through daylight saving changes", () => {
  const zone = "America/New_York", clock = new Date("2026-03-08T07:30:00Z"); // 03:30 after the spring change.
  const period = periodFor("week", "2026-03-08", zone, clock);
  const result = buildProgress(period, [
    session("current", 120, "2026-03-08T07:15:00Z"),
    session("previous-before", 300, "2026-03-01T08:15:00Z"), // 03:15, before cutoff.
    session("previous-after", 600, "2026-03-01T09:00:00Z"), // 04:00, later than cutoff.
  ], [], zone, areas, clock);
  assert.equal(analytics.localClockSeconds(clock, zone), 3 * 3600 + 30 * 60);
  assert.equal(result.previousSeconds, 300);
});

test("daily-goal ratios keep both sides in minutes without discarding over-goal effort or exact seconds", () => {
  const { dailyGoalRatio } = load("src/utils/dailyGoalPresentation.ts");
  assert.equal(dailyGoalRatio(3660, 60), "61 / 60 min");
  assert.equal(dailyGoalRatio(3630, 60), "60 min 30 sec / 60 min");
  assert.equal(dailyGoalRatio(0, 60), "0 / 60 min");
  assert.equal(dailyGoalRatio(28800, 480), "480 / 480 min");
  assert.equal(dailyGoalRatio(NaN, 60), "0 / 60 min");
});

test("Progress separates today's effort from the period total and keeps a tapped day as the primary value", async () => {
  const today = dateKey(new Date(), TZ);
  const previousDay = shiftDay(today, -1);
  const rows = [session("today", 120, new Date(Date.now() - 1000).toISOString()), session("earlier", 1800, previousDay + "T04:00:00Z")];
  const ui = await screenHarness({ sessionRows: rows });
  const text = node => typeof node === "string" ? node : (node.children ?? []).map(text).join("");
  try {
    await ui.press("Month view");
    const hero = () => ui.renderer.root.findByProps({ testID: "progress-day-hero" });
    const summary = ui.renderer.root.findByProps({ testID: "progress-period-summary" });
    assert.match(text(hero()), /Today’s effort2m1 session finished/);
    assert.match(text(summary), /Month total32m/);
    assert.doesNotMatch(text(hero()), /32m|focus time|less/);
    const day = ui.renderer.root.findAllByType("Button").find(button =>
      button.props.accessibilityLabel?.includes(calendarLabelForTest(previousDay)) && button.props.accessibilityLabel?.includes("30m,"));
    assert.ok(day);
    await act(async () => day.props.onPress());
    assert.equal(ui.renderer.root.findByType("Sheet").props.visible, false, "first tap selects the day without a popup");
    assert.match(text(hero()), /recorded effort30m1 session finished/);
    await act(async () => day.props.onPress());
    assert.equal(ui.renderer.root.findByType("Sheet").props.visible, true, "tapping the current day opens its sessions");
    await act(async () => ui.renderer.root.findByType("Sheet").props.onRequestClose());
    await act(async () => ui.renderer.root.findByType("Sheet").props.onDismiss());
    assert.match(text(hero()), /recorded effort30m/);
  } finally { await ui.cleanup(); }
});

function calendarLabelForTest(key) { return analytics.calendarLabel(key); }

test("By category follows the selected day; its week toggle never changes the day or queries history", async () => {
  const today = dateKey(new Date(), TZ);
  const week = periodFor("week", today, TZ);
  const monday = shiftDay(week.start, -7), friday = shiftDay(monday, 4);
  const ui = await screenHarness({ sessionRows: [
    session("monday", 60, `${monday}T04:00:00Z`),
    session("friday", 120, `${friday}T04:00:00Z`),
    session("outside", 900, `${shiftDay(monday, -1)}T04:00:00Z`),
  ] });
  const cards = () => ui.renderer.root.findByProps({ testID: "progress-categories" })
    .findAllByType("Button").filter(button => button.props.accessibilityLabel?.endsWith("View sessions")).map(button => button.props.accessibilityLabel);
  const heroText = () => {
    const text = node => typeof node === "string" ? node : (node.children ?? []).map(text).join("");
    return text(ui.renderer.root.findByProps({ testID: "progress-day-hero" }));
  };
  try {
    await ui.press("Previous week");
    assert.match(cards()[0], /, 2m\. View sessions$/, "the most recent recorded day is the default in a historical week");
    const selectedHero = heroText();
    await ui.press("Categories for selected week");
    assert.match(cards()[0], /, 3m\. View sessions$/);
    assert.equal(heroText(), selectedHero, "the week toggle does not turn the hero into a week total");
    assert.ok(cards().every(label => !label.includes("18m")), "comparison dates stay out of the week");
    const mondayBar = () => ui.renderer.root.findAllByType("Button").find(button => button.props.testID === `progress-day-${monday}`);
    await act(async () => mondayBar().props.onPress());
    assert.equal(ui.renderer.root.findByType("Sheet").props.visible, false);
    assert.match(heroText(), /recorded effort1m/);
    assert.match(cards()[0], /, 1m\. View sessions$/, "picking a bar returns the categories to that day");
    await ui.press("Categories for selected week");
    assert.match(cards()[0], /, 3m\. View sessions$/);
    await ui.press("Categories for selected day");
    assert.match(cards()[0], /, 1m\. View sessions$/);
    assert.equal(ui.historyCalls(), 0, "both scopes reuse the bounded period data");
  } finally { await ui.cleanup(); }
});

test("bar taps select once and open only on a repeated selection, with one haptic for each tap", async () => {
  const today = dateKey(new Date(), TZ), week = periodFor("week", today, TZ);
  const monday = shiftDay(week.start, -7), friday = shiftDay(monday, 4);
  const ui = await screenHarness({ hapticsEnabled: true, sessionRows: [
    session("monday", 60, `${monday}T04:00:00Z`),
    session("friday", 120, `${friday}T04:00:00Z`),
  ] });
  const bar = key => ui.renderer.root.findAllByType("Button").find(button => button.props.testID === `progress-day-${key}`);
  try {
    await ui.press("Previous week");
    const before = ui.haptics();
    await act(async () => bar(monday).props.onPress());
    assert.equal(ui.renderer.root.findByType("Sheet").props.visible, false);
    assert.equal(bar(monday).props.accessibilityState.selected, true);
    assert.equal(bar(friday).props.accessibilityState.selected, false);
    assert.equal(ui.haptics(), before + 1);
    await act(async () => bar(monday).props.onPress());
    const sheet = ui.renderer.root.findByType("Sheet");
    assert.equal(sheet.props.visible, true);
    assert.equal(ui.haptics(), before + 2, "opening a selected day does not double the haptic");
    const rows = sheet.findAllByType("Button").filter(button => button.props.accessibilityLabel?.endsWith("View session"));
    assert.equal(rows.length, 1);
    assert.match(rows[0].props.accessibilityLabel, /1m,/);
    assert.equal(ui.historyCalls(), 0);
  } finally { await ui.cleanup(); }
});

test("a category on the selected day opens that day's sessions; a session opens its detail and comes back", async () => {
  const ui = await screenHarness();
  try {
    const card = ui.renderer.root.findByProps({ testID: "progress-categories" }).findAllByType("Button").find(button => button.props.accessibilityLabel?.endsWith("View sessions"));
    assert.ok(card);
    await act(async () => card.props.onPress());
    const sheetRows = () => ui.renderer.root.findByType("Sheet").findAllByType("Button").filter(button => button.props.accessibilityLabel?.endsWith("View session"));
    const count = sheetRows().length;
    assert.ok(count >= 1);
    await act(async () => sheetRows()[0].props.onPress());
    assert.match(ui.text(), /already saved/);
    await ui.press("Back to sessions");
    assert.equal(sheetRows().length, count, "back to the same day's list");
    assert.equal(ui.renderer.root.findAllByType("Button").find(button => button.props.accessibilityLabel === "Categories for selected day").props.accessibilityState.selected, true);
    assert.equal(ui.historyCalls(), 0);
  } finally { await ui.cleanup(); }
});

test("selected-day category totals match their own rows, rather than the loaded week or month", async () => {
  const text = node => typeof node === "string" ? node : (node.children ?? []).map(text).join("");
  for (const mode of ["week", "month"]) {
    const today = dateKey(new Date(), TZ), current = periodFor(mode, today, TZ);
    const first = current.previousStart, selected = shiftDay(first, 1);
    // The reported account shape: today 6m; the earlier day 3m20s.
    const rows = [
      ...[60, 120, 20].map((seconds, i) => session(`earlier-${i}`, seconds, `${first}T0${i + 1}:00:00Z`)),
      ...[60, 120, 120, 60].map((seconds, i) => session(`selected-${i}`, seconds, `${selected}T0${i + 1}:00:00Z`)),
    ];
    const ui = await screenHarness({ sessionRows: rows });
    const close = async () => {
      await act(async () => ui.renderer.root.findByType("Sheet").props.onRequestClose());
      await act(async () => ui.renderer.root.findByType("Sheet").props.onDismiss());
    };
    const openCard = async () => {
      const card = ui.renderer.root.findByProps({ testID: "progress-categories" }).findAllByType("Button")
        .find(button => button.props.accessibilityLabel?.endsWith("View sessions"));
      await act(async () => card.props.onPress());
    };
    const total = () => text(ui.renderer.root.findByType("Sheet").findAllByType("Text")
      .find(node => node.props.style?.includes?.(ui.styles().detailTotal)));
    const count = () => ui.renderer.root.findByType("Sheet").findAllByType("Button")
      .filter(button => button.props.accessibilityLabel?.endsWith("View session")).length;
    try {
      if (mode === "month") await ui.press("Month view");
      await ui.press(`Previous ${mode}`);
      await openCard();
      assert.equal(count(), 4);
      assert.equal(total(), "6m", `${mode}: the category sheet must sum only the selected day's rows`);
      const subtitle = ui.renderer.root.findByType("Sheet").findAllByType("Text")
        .find(node => node.props.style?.includes?.(ui.styles().caption));
      assert.equal(text(subtitle), analytics.calendarLabel(selected, { weekday: "long", month: "short", day: "numeric" }));
      await close();
      await ui.press(`Categories for selected ${mode}`);
      await openCard();
      assert.equal(count(), 7);
      assert.equal(total(), "9m 20s", "whole-period history keeps every completed second");
      await close();
      assert.equal(ui.historyCalls(), 0, "scope changes do not add network calls");
    } finally { await ui.cleanup(); }
  }
});

test("historical periods show an actual labeled day rather than calling a period total today's effort", () => {
  const clock = new Date("2026-10-12T02:00:00Z");
  const period = periodFor("week", "2026-10-05", TZ, clock);
  const result = buildProgress(period, [session("monday", 120, "2026-10-05T02:00:00Z"), session("friday", 600, "2026-10-09T02:00:00Z")], [], TZ, areas, clock);
  assert.equal(result.seconds, 720);
  assert.equal(analytics.progressHeroDay(result, period, null).key, "2026-10-09");
  assert.equal(analytics.progressHeroDay(result, period, null).seconds, 600);
  assert.equal(analytics.progressHeroDay(result, period, "2026-10-05").seconds, 120);
  assert.equal(analytics.progressHeroDay(result, period, "2026-09-29").key, "2026-10-09", "a day outside this period is never reused");
});

test("colours saved by both earlier palettes keep their place in the paper one", () => {
  const { lifeAreaColor, areaTint } = load("src/utils/lifeAreaColor.ts");
  // Round 84: [pastel, bright (dark theme), deep (paper)] for each slot.
  const slots = [["#6DD4B5", "#30D158", "#3F7A5A"], ["#F4AA88", "#FF9F0A", "#B4651E"], ["#79BFF2", "#64D2FF", "#2E6A9E"], ["#AAB3FF", "#5E5CE6", "#5A4FA0"], ["#E98ABC", "#FF6482", "#A84569"], ["#C1A8FA", "#BF5AF2", "#7A4C9C"]];
  for (const [pastel, bright, next] of slots) {
    assert.equal(lifeAreaColor(1, pastel), next); assert.equal(lifeAreaColor(1, bright), next); assert.equal(lifeAreaColor(1, next.toLowerCase()), next);
  }
  assert.equal(areaTint("#64D2FF", 0.2), "rgba(100,210,255,0.2)");
  assert.equal(areaTint("not a colour"), "rgba(42,32,40,0.12)", "an unknown colour falls back to a faint ink tint on paper");
});

test("offline, Progress says so calmly instead of offering a retry that cannot work", async () => {
  const ui = await screenHarness({ offline: true });
  try {
    assert.doesNotMatch(ui.text(), /Couldn’t refresh Progress/);
    assert.equal(ui.renderer.root.findAllByType("Button").some((b) => b.props.accessibilityLabel === "Retry Progress"), false);
  } finally { await ui.cleanup(); }
});
test("a category's sessions sit under their day: the chosen day only, or the whole week grouped by day",async()=>{
 const today=dateKey(new Date(),TZ),week=periodFor('week',today,TZ),monday=shiftDay(week.start,-7),tuesday=shiftDay(monday,1);
 const rows=[session('m1',60,`${monday}T04:00:00Z`),session('m2',120,`${monday}T05:00:00Z`),session('t1',180,`${tuesday}T04:00:00Z`)];
 const ui=await screenHarness({sessionRows:rows});
 const openCard=async()=>{const card=ui.renderer.root.findByProps({testID:'progress-categories'}).findAllByType('Button').find(b=>b.props.accessibilityLabel?.endsWith('View sessions'));await act(async()=>card.props.onPress());};
 const sheetRows=()=>ui.renderer.root.findByType('Sheet').findAllByType('Button').filter(b=>b.props.accessibilityLabel?.endsWith('View session'));
 const close=async()=>{await act(async()=>ui.renderer.root.findByType('Sheet').props.onRequestClose());await act(async()=>ui.renderer.root.findByType('Sheet').props.onDismiss?.());};
 try{
  await ui.press('Previous week');
  await openCard();assert.equal(sheetRows().length,1,'the selected day (Tuesday) only');await close();
  await ui.press('Categories for selected week');await openCard();
  assert.equal(sheetRows().length,3,'the whole week');
  assert.equal(ui.renderer.root.findByType('Sheet').findAllByProps({testID:'sessions-by-day'}).length>0,true);
  assert.match(ui.text(),/2 sessions · 3m/,'Monday heads its two sessions');
 }finally{await ui.cleanup();}
});

test("Round 84: Your rhythm shows quiet markers from your whole history, under the streak, and none before there are any", async () => {
  // Round 85: the markers live on the week overview, under the streak card.
  const none = await screenHarness({ overview: true });
  try { assert.doesNotMatch(none.text(), /Along the way/, "no history loaded, no empty section"); } finally { await none.cleanup(); }
  const now = Date.now();
  const sessions = Array.from({ length: 12 }, (_, i) => ({ id: `h${i}`, subject_id: 1, activity_type: "other", duration_seconds: 3600, xp_earned: 0, completed_at: new Date(now - i * 86400000).toISOString() }));
  const ui = await screenHarness({ overview: true, history: { userId: "me", areas: [], sessions } });
  try {
    const shown = ui.text();
    assert.match(shown, /Along the way10 hours focused in totalShowed up on 10 different days10 sessions finishedLongest run: 12 days in a rowLongest session: 1h 00m/);
    assert.ok(shown.indexOf("streak") < shown.indexOf("Along the way"), "the markers sit under the streak");
    assert.match(shown, /Your rhythm/);
  } finally { await ui.cleanup(); }
});

test("Round 85: Your rhythm opens on this week: total, days here with rest days, time by activity, and History for the charts", async () => {
  const ui = await screenHarness({ overview: true });
  try {
    const shown = ui.text();
    assert.match(shown, /Your rhythm\./);
    assert.match(shown, /This week · /);
    assert.match(shown, /30sfocused/, "the week's total leads");
    assert.match(shown, /1 day here/, "the lilac card counts the days you showed up");
    assert.match(shown, /2-day streak/);
    assert.ok(ui.renderer.root.findAllByProps({ testID: "rhythm-week" }).length > 0);
    assert.match(shown, /Time by activity/);
    assert.doesNotMatch(shown, /Week total|By category/, "the detailed charts wait under History");
    await ui.press("Open your history");
    assert.match(ui.text(), /Week total/, "History shows the detailed charts");
    await ui.press("Back to this week");
    assert.match(ui.text(), /Time by activity/);
  } finally { await ui.cleanup(); }
});

test("Round 85: the rest-day line names a rest day this week and the ones still ready", () => {
  const host = name => props => React.createElement(name, props, props.children);
  const { restLine } = load("src/components/RhythmOverview.tsx", { "@expo/vector-icons": { Ionicons: host("Icon") }, "./AppText": { Text: host("Text") }, "./MotionPressable": host("Button"), "react-native": { StyleSheet: { create: styles => styles }, View: host("View") } });
  assert.equal(restLine(["2026-10-28"], 1, 4), "Wednesday was a rest day, so your streak kept going. 1 more rest day is ready if you need it.");
  assert.equal(restLine([], 2, 3), "Missed a day? 2 more rest days are ready if you need them.");
  assert.equal(restLine([], 0, 0), "Your first session starts this week’s story. Even 15 minutes counts.");
  assert.doesNotMatch(restLine(["2026-10-28", "2026-10-29"], 0, 2), /—/);
});
