// Screens now read exams and subjects. Tests that render those screens for
// other reasons get an empty, ready study plan instead of the real service.
const plan = { ready: true, busy: false, error: null, scope: null, online: true, courses: [], exams: [], recent: [], pendingCount: 0,
  saveCourse: async () => false, saveExam: async () => false, remove: async () => false, ensureCourse: async () => null };
module.exports = name => {
  if (name.endsWith('/useStudyPlan')) return { __esModule: true, useStudyPlan: () => plan };
  // The Subject row has its own tests; elsewhere it stays out of the way.
  if (name.endsWith('/SubjectSetupRow')) return { __esModule: true, default: () => null };
  // Reanimated's sliding highlight is native-only; a plain view stands in.
  if (name.endsWith('/SlidingSelection')) { const React = require('react'); return { __esModule: true, default: props => React.createElement('View', props) }; }
  if (name.endsWith('/useSavedRoutines')) return { __esModule: true, useSavedRoutines: () => ({ ready: true, routines: [], scope: null, online: true, pendingCount: 0, conflicts: [] }) };
  // Home's summary sections and Progress's milestones row have their own tests.
  if (name.endsWith('/HomeSections')) return { __esModule: true, HomeExams: () => null, HomeSquad: () => null, HomeWeek: () => null, HomeMilestones: () => null,
    useWeekProgress: () => ({ week: null, period: { today: '' } }), WeekBars: () => null };
  // Home's drag-to-rearrange runs on the native gesture system; tests see its props.
  if (name.endsWith('/TodaySheet')) { const React = require('react'); return { __esModule: true, default: props => React.createElement('TodaySheet', props) }; }
  // Swipe actions run on the native gesture system; rows render as they are.
  if (name.endsWith('/MoreMenu')) { const React = require('react'); return { __esModule: true, default: props => React.createElement('MoreMenu', props) }; }
  if (name.endsWith('/MilestonesRow')) return { __esModule: true, default: () => null };
  // Which subject each study session was for comes from the server; its own tests cover it.
  if (name.endsWith('/SubjectBreakdown')) return { __esModule: true, default: () => null, subjectSeconds: () => [] };
  if (name.endsWith('/SquadsSection')) return { __esModule: true, SquadSummary: () => null, daysLeftInWeek: () => 3, yourPlace: () => '' };
  if (name.endsWith('/useSquads')) return { __esModule: true, useSquads: () => ({ ready: true, squads: [], online: true, refresh: async () => {} }) };
  if (name.endsWith('/StudyLifecycle')) return { __esModule: true, default: () => null, requestStudySync() {} };
  return undefined;
};
