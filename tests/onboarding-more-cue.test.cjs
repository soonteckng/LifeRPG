/* global __dirname */
// The intro's first page fits on one screen: five one-line areas, no "More below" cue.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const read = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

test('the intro frame has no More below cue any more', () => {
  const frame = read('src/components/OnboardingFrame.tsx');
  assert.doesNotMatch(frame, /More below|onboarding-more|morePill/);
  assert.match(frame, /<ScrollView ref=\{scroll\}/, 'a very small phone can still scroll');
});

test('each area is one short line, so all five fit without scrolling', () => {
  const picker = read('src/components/IdeaAreaPicker.tsx');
  const lines = [...picker.slice(picker.indexOf('const LINES'), picker.indexOf('};', picker.indexOf('const LINES'))).matchAll(/: "([^"]+)"/g)].map(match => match[1]);
  assert.equal(lines.length, 5);
  for (const line of lines) assert.ok(line.length <= 26, `"${line}" fits on one line`);
  assert.match(picker, /<Text style=\{s\.line\} numberOfLines=\{1\}>/);
  assert.match(picker, /row: \{ minHeight: 58,/);
});
