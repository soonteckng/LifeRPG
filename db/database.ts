import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('liferpg.db');

export interface UserProfile {
  id: number;
  username: string;
  avatar: string;
  class_title: string;
  level: number;
  current_xp: number;
  gold: number;
  streak_count: number;
  last_active_date: string;
}

export interface Task {
  id: number;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  is_completed: number;
  xp_awarded: number;
  is_recurring?: number;
  repeat_rule?: string;
  target_minutes?: number;
  subject_id?: number | null;
  last_completed_date?: string | null;
}

export interface Attribute {
  id: number;
  title: string;
  level: number;
  current_xp: number;
  color_code?: string;
}

export interface DailyStat {
  date: string;
  dayLabel: string;
  focusMinutes: number;
  xpEarned: number;
}

export interface Reward {
  id: number;
  title: string;
  cost_gold: number;
  is_claimed: number;
  created_at?: string;
}

const defaultSubjects = [
  { title: 'Fitness & Health', colorCode: '#EF4444' },
  { title: 'Knowledge', colorCode: '#6366F1' },
  { title: 'Grooming & Vitality', colorCode: '#EC4899' },
  { title: 'Life Admin', colorCode: '#10B981' },
] as const;

export function getTitleForLevel(level: number): string {
  if (level >= 15) return 'Grandmaster Archmage 👑';
  if (level >= 10) return 'Master Wizard 🧙‍♂️';
  if (level >= 5) return 'Adept Practitioner ⚡';
  return 'Novice Scholar 📚';
}

export function initDatabase() {
  db.execSync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      avatar TEXT NOT NULL,
      class_title TEXT NOT NULL,
      level INTEGER DEFAULT 1,
      current_xp INTEGER DEFAULT 0,
      gold INTEGER DEFAULT 0,
      streak_count INTEGER DEFAULT 1,
      last_active_date TEXT
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      level INTEGER DEFAULT 1,
      current_xp INTEGER DEFAULT 0,
      color_code TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      difficulty TEXT CHECK(difficulty IN ('easy', 'medium', 'hard')),
      is_completed INTEGER DEFAULT 0,
      xp_awarded INTEGER DEFAULT 100,
      is_recurring INTEGER DEFAULT 0,
      repeat_rule TEXT DEFAULT 'once',
      target_minutes INTEGER DEFAULT 30,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
      last_completed_date TEXT
    );

    CREATE TABLE IF NOT EXISTS study_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      duration_seconds INTEGER NOT NULL,
      xp_earned INTEGER NOT NULL,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS completed_timer_sessions (
      session_id TEXT PRIMARY KEY,
      completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      cost_gold INTEGER NOT NULL,
      is_claimed INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
    const tableInfo = db.getAllSync<{ name: string }>("PRAGMA table_info(tasks);");
    if (!tableInfo.some((col) => col.name === 'target_minutes')) {
      db.execSync('ALTER TABLE tasks ADD COLUMN target_minutes INTEGER DEFAULT 30;');
    }
    if (!tableInfo.some((col) => col.name === 'last_completed_date')) {
      db.execSync('ALTER TABLE tasks ADD COLUMN last_completed_date TEXT;');
    }

    const profileInfo = db.getAllSync<{ name: string }>("PRAGMA table_info(user_profile);");
    if (!profileInfo.some((col) => col.name === 'gold')) {
      db.execSync('ALTER TABLE user_profile ADD COLUMN gold INTEGER DEFAULT 0;');
    }
  } catch (e) {
    console.error('Migration check failed:', e);
  }

  const today = new Date().toISOString().split('T')[0];
  const user = db.getFirstSync<UserProfile>('SELECT * FROM user_profile WHERE id = 1;');

  if (!user) {
    const defaultTitle = getTitleForLevel(1);
    db.runSync(
      'INSERT INTO user_profile (id, username, avatar, class_title, level, current_xp, gold, streak_count, last_active_date) VALUES (1, ?, ?, ?, 1, 0, 0, 1, ?);',
      ['Hero', '🧙‍♂️', defaultTitle, today]
    );
  }

  // Seed Default Subjects/Attributes
  const subjectCount = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM subjects;');
  if (subjectCount && subjectCount.count === 0) {
    for (const subject of defaultSubjects) {
      db.runSync(
        'INSERT INTO subjects (title, level, current_xp, color_code) VALUES (?, 1, 0, ?);',
        [subject.title, subject.colorCode]
      );
    }
  }
  migrateLegacySubjects();

  // Seed Default Balanced Shop Rewards (2:1 Ratio Economy)
  const rewardCount = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM rewards;');
  if (rewardCount && rewardCount.count === 0) {
    db.runSync("INSERT INTO rewards (title, cost_gold) VALUES ('☕ 15-Min Coffee Break', 150);");
    db.runSync("INSERT INTO rewards (title, cost_gold) VALUES ('🎮 30-Min Gaming Session', 300);");
    db.runSync("INSERT INTO rewards (title, cost_gold) VALUES ('🎬 1-Hour Movie / Series', 600);");
    db.runSync("INSERT INTO rewards (title, cost_gold) VALUES ('🏖️ Full Evening Off', 1200);");
  }
}

export function getDatabase() {
  return db;
}

export function getUserProfile(): UserProfile {
  try {
    const user = db.getFirstSync<UserProfile>('SELECT * FROM user_profile WHERE id = 1;');
    if (user) return user;

    const today = new Date().toISOString().split('T')[0];
    const defaultTitle = getTitleForLevel(1);
    db.runSync(
      'INSERT INTO user_profile (id, username, avatar, class_title, level, current_xp, gold, streak_count, last_active_date) VALUES (1, ?, ?, ?, 1, 0, 0, 1, ?);',
      ['Hero', '🧙‍♂️', defaultTitle, today]
    );
    return db.getFirstSync<UserProfile>('SELECT * FROM user_profile WHERE id = 1;')!;
  } catch (e) {
    console.error('Failed to get user profile, returning fallback:', e);
    return {
      id: 1,
      username: 'Hero',
      avatar: '🧙‍♂️',
      class_title: 'Novice Scholar 📚',
      level: 1,
      current_xp: 0,
      gold: 0,
      streak_count: 1,
      last_active_date: new Date().toISOString().split('T')[0],
    };
  }
}

export function updateUserProfile(username: string, avatar: string, class_title: string) {
  db.runSync(
    'UPDATE user_profile SET username = ?, avatar = ?, class_title = ? WHERE id = 1;',
    [username, avatar, class_title]
  );
}

export function addXPAndCheckLevelUp(xpGain: number): { newLevel: number; newXP: number; leveledUp: boolean } {
  const profile = getUserProfile();
  let currentXP = (profile?.current_xp || 0) + xpGain;
  let level = profile?.level || 1;
  let leveledUp = false;

  let requiredXP = Math.floor(100 * Math.pow(level, 1.5));

  while (currentXP >= requiredXP) {
    currentXP -= requiredXP;
    level += 1;
    leveledUp = true;
    requiredXP = Math.floor(100 * Math.pow(level, 1.5));
  }

  const newTitle = getTitleForLevel(level);

  db.runSync('UPDATE user_profile SET level = ?, current_xp = ?, class_title = ? WHERE id = 1;', [
    level,
    currentXP,
    newTitle,
  ]);

  return { newLevel: level, newXP: currentXP, leveledUp };
}

export function addGold(goldGain: number) {
  db.runSync('UPDATE user_profile SET gold = gold + ? WHERE id = 1;', [goldGain]);
}

export function claimTimerSession(sessionId: string): boolean {
  const result = db.runSync(
    'INSERT OR IGNORE INTO completed_timer_sessions (session_id) VALUES (?);',
    [sessionId]
  );
  return result.changes === 1;
}

export function logStudySession(durationSeconds: number, xpEarned: number, subjectId: number | null = null) {
  const today = new Date().toISOString().split('T')[0];

  db.runSync(
    'INSERT INTO study_sessions (duration_seconds, xp_earned, subject_id, created_at) VALUES (?, ?, ?, ?);',
    [durationSeconds, xpEarned, subjectId, today]
  );

  // Dynamic Streak Calculation
  const profile = getUserProfile();
  if (profile.last_active_date !== today) {
    let newStreak = 1;
    if (profile.last_active_date) {
      const lastDate = new Date(profile.last_active_date);
      const currDate = new Date(today);
      const diffDays = Math.round((currDate.getTime() - lastDate.getTime()) / (1000 * 3600 * 24));
      if (diffDays === 1) {
        newStreak = profile.streak_count + 1;
      }
    }
    db.runSync('UPDATE user_profile SET streak_count = ?, last_active_date = ? WHERE id = 1;', [
      newStreak,
      today,
    ]);
  }

  // Linked Attribute/Subject Leveling
  if (subjectId) {
    const attr = db.getFirstSync<Attribute>('SELECT * FROM subjects WHERE id = ?;', [subjectId]);
    if (attr) {
      let newXP = attr.current_xp + xpEarned;
      let newLevel = attr.level;
      let required = newLevel * 50;

      while (newXP >= required) {
        newXP -= required;
        newLevel += 1;
        required = newLevel * 50;
      }

      db.runSync('UPDATE subjects SET level = ?, current_xp = ? WHERE id = ?;', [newLevel, newXP, subjectId]);
    }
  }
}

export function getWeeklyStats(): DailyStat[] {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const result: DailyStat[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayLabel = days[d.getDay()];

    const row = db.getFirstSync<{ total_sec: number; total_xp: number }>(
      `SELECT SUM(duration_seconds) as total_sec, SUM(xp_earned) as total_xp 
       FROM study_sessions 
       WHERE date(created_at) = ?;`,
      [dateStr]
    );

    result.push({
      date: dateStr,
      dayLabel,
      focusMinutes: row && row.total_sec ? Math.round(row.total_sec / 60) : 0,
      xpEarned: row && row.total_xp ? row.total_xp : 0,
    });
  }

  return result;
}

export function getTasks(): Task[] {
  const today = new Date().toISOString().split('T')[0];

  db.runSync(
    `UPDATE tasks 
     SET is_completed = 0 
     WHERE is_recurring = 1 
       AND is_completed = 1 
       AND (last_completed_date IS NULL OR last_completed_date < ?);`,
    [today]
  );

  return db.getAllSync<Task>('SELECT * FROM tasks ORDER BY id DESC;');
}

export function addTask(
  title: string,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  subjectId: number | null = null,
  repeatRule: string = 'once',
  targetMinutes: number = 30
) {
  const xp = targetMinutes * 1;
  const isRecurring = repeatRule !== 'once' ? 1 : 0;

  db.runSync(
    'INSERT INTO tasks (title, difficulty, xp_awarded, is_recurring, repeat_rule, target_minutes, subject_id) VALUES (?, ?, ?, ?, ?, ?, ?);',
    [title, difficulty, xp, isRecurring, repeatRule, targetMinutes, subjectId]
  );
}

export function updateTask(
  id: number,
  title: string,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  repeatRule: string = 'once',
  targetMinutes: number = 30
) {
  const xp = targetMinutes * 1;
  const isRecurring = repeatRule !== 'once' ? 1 : 0;

  db.runSync(
    'UPDATE tasks SET title = ?, difficulty = ?, xp_awarded = ?, is_recurring = ?, repeat_rule = ?, target_minutes = ? WHERE id = ?;',
    [title, difficulty, xp, isRecurring, repeatRule, targetMinutes, id]
  );
}

export function completeTask(taskId: number): boolean {
  const task = db.getFirstSync<Task>('SELECT * FROM tasks WHERE id = ?;', [taskId]);
  if (!task || task.is_completed === 1) return false;

  const today = new Date().toISOString().split('T')[0];

  db.runSync(
    'UPDATE tasks SET is_completed = 1, last_completed_date = ? WHERE id = ?;',
    [today, taskId]
  );

  return true;
}

export function uncompleteTask(taskId: number) {
  db.runSync('UPDATE tasks SET is_completed = 0 WHERE id = ?;', [taskId]);
}

export function deleteTask(taskId: number) {
  db.runSync('DELETE FROM tasks WHERE id = ?;', [taskId]);
}

export function getSubjects(): Attribute[] {
  migrateLegacySubjects();
  return db.getAllSync<Attribute>('SELECT * FROM subjects ORDER BY id ASC;');
}

function migrateLegacySubjects() {
  const legacySubjects = [
    { titles: ['Strength', 'Strength & Health', 'Fitness'], replacement: defaultSubjects[0] },
    { titles: ['Intelligence', 'Intellect & Code', 'Computer Science'], replacement: defaultSubjects[1] },
    { titles: ['Mathematics'], replacement: defaultSubjects[2] },
    { titles: ['Focus', 'Focus & Mindfulness'], replacement: defaultSubjects[3] },
  ];

  for (const legacy of legacySubjects) {
    for (const title of legacy.titles) {
      const source = db.getFirstSync<Attribute>('SELECT * FROM subjects WHERE title = ?;', [title]);
      if (!source || source.title === legacy.replacement.title) continue;

      const target = db.getFirstSync<Attribute>('SELECT * FROM subjects WHERE title = ?;', [
        legacy.replacement.title,
      ]);

      if (target) {
        db.runSync('UPDATE tasks SET subject_id = ? WHERE subject_id = ?;', [target.id, source.id]);
        db.runSync('UPDATE study_sessions SET subject_id = ? WHERE subject_id = ?;', [target.id, source.id]);
        db.runSync(
          'UPDATE subjects SET level = ?, current_xp = current_xp + ? WHERE id = ?;',
          [Math.max(target.level, source.level), source.current_xp, target.id]
        );
        db.runSync('DELETE FROM subjects WHERE id = ?;', [source.id]);
      } else {
        db.runSync('UPDATE subjects SET title = ?, color_code = ? WHERE id = ?;', [
          legacy.replacement.title,
          legacy.replacement.colorCode,
          source.id,
        ]);
      }
    }
  }

  for (const subject of defaultSubjects) {
    const existing = db.getFirstSync<{ id: number }>('SELECT id FROM subjects WHERE title = ?;', [
      subject.title,
    ]);
    if (!existing) {
      db.runSync(
        'INSERT INTO subjects (title, level, current_xp, color_code) VALUES (?, 1, 0, ?);',
        [subject.title, subject.colorCode]
      );
    }
  }
}

export function getRewards(): Reward[] {
  return db.getAllSync<Reward>('SELECT * FROM rewards WHERE is_claimed = 0 ORDER BY id DESC;');
}

export function addReward(title: string, costGold: number) {
  db.runSync(
    'INSERT INTO rewards (title, cost_gold, is_claimed) VALUES (?, ?, 0);',
    [title, costGold]
  );
}

export function claimReward(rewardId: number): boolean {
  const reward = db.getFirstSync<Reward>('SELECT * FROM rewards WHERE id = ?;', [rewardId]);
  const profile = getUserProfile();

  if (!reward || reward.is_claimed === 1 || profile.gold < reward.cost_gold) {
    return false;
  }

  db.runSync('UPDATE user_profile SET gold = gold - ? WHERE id = 1;', [reward.cost_gold]);
  db.runSync('UPDATE rewards SET is_claimed = 1 WHERE id = ?;', [rewardId]);
  return true;
}

export function deleteReward(rewardId: number) {
  db.runSync('DELETE FROM rewards WHERE id = ?;', [rewardId]);
}

export function resetDatabase() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const defaultTitle = getTitleForLevel(1);

    db.execSync(`
      DELETE FROM study_sessions;
      DELETE FROM completed_timer_sessions;
      DELETE FROM tasks;
      DELETE FROM rewards;
      DELETE FROM sqlite_sequence WHERE name IN ('study_sessions', 'tasks', 'rewards');
      UPDATE user_profile 
      SET level = 1, current_xp = 0, gold = 0, streak_count = 1, class_title = '${defaultTitle}', last_active_date = '${today}' 
      WHERE id = 1;
      UPDATE subjects SET level = 1, current_xp = 0;
      VACUUM;
    `);

    // Re-seed default rewards on reset
    db.runSync("INSERT INTO rewards (title, cost_gold) VALUES ('☕ 15-Min Coffee Break', 150);");
    db.runSync("INSERT INTO rewards (title, cost_gold) VALUES ('🎮 30-Min Gaming Session', 300);");
    db.runSync("INSERT INTO rewards (title, cost_gold) VALUES ('🎬 1-Hour Movie / Series', 600);");
    db.runSync("INSERT INTO rewards (title, cost_gold) VALUES ('🏖️ Full Evening Off', 1200);");
  } catch (e) {
    console.error('Failed to reset database:', e);
  }
}