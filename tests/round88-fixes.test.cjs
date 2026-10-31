/* global __dirname */
// Round 88: the ended page keeps the timer's look, a blank row no longer shows
// while editing, three rotating ideas instead of the whole grid, Your rhythm
// steps through weeks with its own arrows, routine setup opens at a fixed height,
// a one-page introduction and developer replays for setup and the notification ask.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file) {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(require, module, module.exports);
  return module.exports;
}
const ideas = [
  ...['l1', 'l2', 'l3'].map(id => ({ id, area: 'learning' })),
  ...['w1', 'w2', 'w3'].map(id => ({ id, area: 'wellbeing' })),
  ...['p1', 'p2'].map(id => ({ id, area: 'work' })),
  ...['c1', 'c2'].map(id => ({ id, area: 'creativity' })),
];

test('with no routines, three ideas: one each from learning, wellbeing and work, changing each day', () => {
  const { pickIdeas } = load('src/utils/ideaPicks.ts');
  const day0 = pickIdeas(ideas, [], 0), day1 = pickIdeas(ideas, [], 1);
  assert.deepEqual(day0.map(i => i.area), ['learning', 'wellbeing', 'work']);
  assert.deepEqual(day0.map(i => i.id), ['l1', 'w1', 'p1']);
  assert.deepEqual(day1.map(i => i.id), ['l2', 'w2', 'p2'], 'a new day, new picks');
  assert.deepEqual(pickIdeas(ideas, [], 3).map(i => i.id), ['l1', 'w1', 'p2'], 'each area wraps round on its own');
});

test('with routines, two from the area you use most and one from an area you do not use yet', () => {
  const { pickIdeas } = load('src/utils/ideaPicks.ts');
  const picks = pickIdeas(ideas, ['wellbeing', 'wellbeing', 'learning'], 0);
  assert.equal(picks.length, 3);
  assert.deepEqual(picks.slice(0, 2).map(i => i.area), ['wellbeing', 'wellbeing']);
  assert.ok(['work', 'creativity'].includes(picks[2].area), picks[2].area);
  assert.equal(new Set(picks).size, 3, 'never the same idea twice');
});

test('ideas fill gaps, never repeat and stop when everything is saved', () => {
  const { pickIdeas, ideaDay, IDEAS_FULL_UNTIL } = load('src/utils/ideaPicks.ts');
  assert.deepEqual(pickIdeas([], [], 5), []);
  const two = pickIdeas(ideas.slice(0, 2), ['learning'], 0);
  assert.deepEqual(two.map(i => i.id).sort(), ['l1', 'l2'], 'only what is left, no duplicates');
  for (let day = 0; day < 20; day++) assert.equal(new Set(pickIdeas(ideas, ['work'], day)).size, 3);
  assert.equal(IDEAS_FULL_UNTIL, 5);
  assert.equal(ideaDay(new Date(2026, 9, 31, 23, 59)) + 1, ideaDay(new Date(2026, 10, 1, 0, 1)), 'the picks turn over at local midnight');
});

test('Your activities shows three ideas, More ideas for the rest, and a small link once you have five routines', () => {
  const card = read('src/components/SavedRoutinesCard.tsx');
  assert.match(card, /pickIdeas\(/);
  assert.match(card, /testID="ideas-more"/);
  assert.match(card, /testID="ideas-fewer"/);
  assert.match(card, /Need ideas\?/);
});

test('an ended session keeps the timer page: its name, "Ended early", no buttons and no extra words', () => {
  const screen = read('src/components/SessionScreen.tsx');
  assert.match(screen, /const stopped = phase === "ended";\n {2}const timerPage = focusing \|\| stopped;/);
  assert.match(screen, /<AppHeader centered title=\{timerPage \? "" :/);
  assert.match(screen, /\{stopped \? "Ended early" :/);
  assert.match(screen, /pointerEvents=\{stopped \? "none" : "auto"\}/, 'the buttons cannot be pressed once it has ended');
  // "Session ended" stays only as the screen reader's status line.
  for (const gone of ['`${title} · Ended`', 'Ending now doesn’t save this session.']) assert.ok(!screen.includes(gone), gone);
});

test('rows in edit mode are not drawn to a texture, so a removed row never leaves a blank space', () => {
  assert.doesNotMatch(read('src/components/PersonalUI.tsx'), /renderToHardwareTextureAndroid/);
  assert.match(read('src/components/SavedRoutinesCard.tsx'), /onRemove/, 'older tasks can be removed from their badge too');
});

test('Your rhythm steps through weeks with its own arrows, never past this week, and days open their sessions', () => {
  const overview = read('src/components/RhythmOverview.tsx');
  assert.match(overview, /testID="rhythm-previous"/);
  assert.match(overview, /onPress=\{onNext\} disabled=\{current\}/);
  assert.match(overview, /Show its sessions/);
  assert.match(overview, /testID="rhythm-history"/);
  const page = read('src/app/(tabs)/progress.tsx');
  assert.match(page, /onDay=\{/); assert.match(page, /onMore=\{toggleHistory\}/);
});

test('routine setup opens at a fixed height so it does not grow while sliding up', () => {
  assert.match(read('src/components/RoutineEditorSheet.tsx'), /attached expanded heightRatio=\{0\.88\} maxHeightRatio=\{0\.9\}/);
});

test('first-time setup is short: one How it works page, then Go to Today, and the guide no longer runs', () => {
  const source = read('src/constants/onboarding.ts');
  const pages = source.slice(source.indexOf('INTRO_PAGES'));
  assert.equal((pages.slice(0, pages.indexOf('];')).match(/title:/g) ?? []).length, 1, 'one page');
  assert.match(pages, /title: "How it works"/);
  assert.ok(!pages.slice(0, pages.indexOf('];')).includes('—'));
  assert.match(read('src/components/OnboardingJourney.tsx'), /"Go to Today"/);
});

test('the developer can replay setup and the notification ask; the store only reopens on request', () => {
  const tools = read('src/components/DeveloperTools.tsx');
  assert.match(tools, /testID="dev-replay-setup"/);
  assert.match(tools, /testID="dev-notification-ask"/);
  assert.doesNotMatch(tools, /Replay the guide/);
  assert.match(read('src/services/notificationOnboardingStore.ts'), /reopen: \(owner: string, current: \(\) => boolean = \(\) => true\) => change\(owner, current, \(\) => "ready"\)/);
});
