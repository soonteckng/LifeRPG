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
    "#F29D82",
  );
  assert.equal(result.areas.length, 2);
  assert.equal(durationLabel(30), "30s");
  assert.equal(durationLabel(3600), "1h");
});
function serviceHarness(respond) {
  const calls = [];
  const supabase = {
    from(table) {
      const state = { table, filters: [] };
      const query = {};
      for (const method of [
        "select",
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
      getFocusStreak: async () => 2,
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
      getProgressGoals: async () => [], getProgressSubjects: async () => areas, getFocusStreak: async () => 2,
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
async function screenHarness({ empty = false, historyFailure = false } = {}) {
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
    "../../context/UserContext": {
      useUser: () => ({
        profile: { timezone: TZ, level: 2 },
        hapticsEnabled: false,
      }),
    },
    "../../context/TimerContext": {
      useTimer: () => ({ sessionSummary: null }),
    },
    "../../hooks/useReducedMotion": { useReducedMotion: () => true },
    "../hooks/useReducedMotion": { useReducedMotion: () => true },
    "../../hooks/useProgressData": {
      useProgressData: (period) => ({
        data: {
          key: period.start,
          sessions: empty ? [] : [session("a", 30, stamp)],
          goals: [],
          areas,
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
    assert.match(ui.text(), /2-day focus streak/);
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
test("full history loads on demand and saved session details do not mutate rewards", async () => {
  const ui = await screenHarness();
  try {
    assert.equal(ui.historyCalls(), 0);
    await ui.press("View all recent sessions");
    assert.equal(ui.historyCalls(), 1);
    const row = ui.renderer.root
      .findAllByType("Button")
      .find(
        (b) =>
          b.props.accessibilityLabel?.includes("1m,") &&
          b.props.accessibilityLabel?.endsWith("View session"),
      );
    await act(async () => row.props.onPress());
    assert.match(ui.text(), /already saved/);
    await ui.press("Back to sessions");
    assert.match(ui.text(), /Session history/);
  } finally {
    await ui.cleanup();
  }
});
test("empty Progress explains how to begin and still makes full history accessible", async () => {
  const ui = await screenHarness({ empty: true });
  try {
    assert.match(ui.text(), /Every completed session counts/);
    assert.match(ui.text(), /Room to grow/);
    await ui.press("View all recent sessions");
    assert.equal(ui.historyCalls(), 1);
  } finally {
    await ui.cleanup();
  }
});

test("a history failure does not suppress another day’s empty-state details", async () => {
  const ui = await screenHarness({ empty: true, historyFailure: true });
  try {
    await ui.press("View all recent sessions");
    assert.match(ui.text(), /Couldn’t load sessions/);
    await act(async () => {
      ui.renderer.root.findByType("Sheet").props.onRequestClose();
    });
    await act(async () => {
      ui.renderer.root.findByType("Sheet").props.onDismiss();
    });
    const day = ui.renderer.root
      .findAllByType("Button")
      .find((b) => b.props.accessibilityLabel?.includes("no sessions"));
    await act(async () => day.props.onPress());
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
    assert.ok(text.indexOf("30s") < text.indexOf("Dot · focus day"));
    assert.ok(text.indexOf("Dot · focus day") < text.indexOf("Where it went"));
    assert.ok(text.indexOf("Where it went") < text.indexOf("Recent sessions"));
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
    const aboveChart = s.page.paddingTop + Math.ceil(s.title.fontSize * 1.3) + s.header.marginBottom
      + s.segmentButton.minHeight + s.hero.paddingTop + Math.ceil(s.focusValue.fontSize * 1.3)
      + s.focusValue.marginTop + s.heroDescription.marginTop + s.heroDescription.lineHeight * 2
      + s.hero.paddingBottom;
    const chart = s.card.paddingVertical * 2 + s.caption.lineHeight + s.chartHeader.marginBottom
      + s.chart.paddingTop + s.barTrack.height + s.barTrack.marginBottom + Math.ceil(s.dayLabel.fontSize * 1.3)
      + s.dayStatus.height + s.dayStatus.marginTop + s.legend.marginTop + s.caption.lineHeight;
    assert.ok(aboveChart + chart < 440, `chart budget ${aboveChart + chart}px`);
    assert.equal(s.periodNav.paddingVertical, undefined);
  } finally { await ui.cleanup(); }
});
