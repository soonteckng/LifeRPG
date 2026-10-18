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
  if (name.endsWith('/HomeStudyStrip')) return { __esModule: true, default: () => null };
  if (name.endsWith('/useSquads')) return { __esModule: true, useSquads: () => ({ ready: true, squads: [], online: true, refresh: async () => {} }) };
  if (name.endsWith('/StudyLifecycle')) return { __esModule: true, default: () => null, requestStudySync() {} };
  return undefined;
};
