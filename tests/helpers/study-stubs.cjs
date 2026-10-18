// Screens now read exams and subjects. Tests that render those screens for
// other reasons get an empty, ready study plan instead of the real service.
const plan = { ready: true, busy: false, error: null, scope: null, online: true, courses: [], exams: [], recent: [], pendingCount: 0,
  saveCourse: async () => false, saveExam: async () => false, remove: async () => false };
module.exports = name => {
  if (name.endsWith('/useStudyPlan')) return { __esModule: true, useStudyPlan: () => plan };
  if (name.endsWith('/StudyLifecycle')) return { __esModule: true, default: () => null, requestStudySync() {} };
  return undefined;
};
