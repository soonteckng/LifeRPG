import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('liferpg.db');

export interface UserProfile {
  id: number;
  username: string;
  avatar: string;
  class_title: string;
  level: number;
  current_xp: number;
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
      subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS study_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      duration_seconds INTEGER NOT NULL,
      xp_earned INTEGER NOT NULL,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Bulletproof Column Inspection: Automatically adds target_minutes if missing on existing installations
  try {
    const tableInfo = db.getAllSync<{ name: string }>("PRAGMA table_info(tasks);");
    const hasTargetMinutes = tableInfo.some((col) => col.name === 'target_minutes');

    if (!hasTargetMinutes) {
      console.log('Migrating database: Adding target_minutes column to tasks...');
      db.execSync('ALTER TABLE tasks ADD COLUMN target_minutes INTEGER DEFAULT 30;');
    }
  } catch (e) {
    console.error('Migration check failed:', e);
  }

  // Seed default User Profile
  const user = db.getFirstSync<UserProfile>('SELECT * FROM user_profile WHERE id = 1;');
  const today = new Date().toISOString().split('T')[0];

  if (!user) {
    db.runSync(
      'INSERT INTO user_profile (id, username, avatar, class_title, level, current_xp, streak_count, last_active_date) VALUES (1, ?, ?, ?, 1, 0, 1, ?);',
      ['Hero', '🧙‍♂️', 'Scholar', today]
    );
  }

  // Seed default Attributes
  const subjectCount = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM subjects;');
  if (subjectCount && subjectCount.count === 0) {
    db.runSync("INSERT INTO subjects (title, level, current_xp, color_code) VALUES ('Strength', 1, 0, '#EF4444');");
    db.runSync("INSERT INTO subjects (title, level, current_xp, color_code) VALUES ('Intelligence', 1, 0, '#6366F1');");
    db.runSync("INSERT INTO subjects (title, level, current_xp, color_code) VALUES ('Focus', 1, 0, '#10B981');");
  }
}

export function getDatabase() {
  return db;
}

export function getUserProfile(): UserProfile {
  return db.getFirstSync<UserProfile>('SELECT * FROM user_profile WHERE id = 1;')!;
}

export function updateUserProfile(username: string, avatar: string, class_title: string) {
  db.runSync(
    'UPDATE user_profile SET username = ?, avatar = ?, class_title = ? WHERE id = 1;',
    [username, avatar, class_title]
  );
}

export function addXPAndCheckLevelUp(xpGain: number): { newLevel: number; newXP: number; leveledUp: boolean } {
  const profile = getUserProfile();
  let currentXP = profile.current_xp + xpGain;
  let level = profile.level;
  let leveledUp = false;

  let requiredXP = Math.floor(100 * Math.pow(level, 1.5));

  while (currentXP >= requiredXP) {
    currentXP -= requiredXP;
    level += 1;
    leveledUp = true;
    requiredXP = Math.floor(100 * Math.pow(level, 1.5));
  }

  db.runSync('UPDATE user_profile SET level = ?, current_xp = ? WHERE id = 1;', [level, currentXP]);

  return { newLevel: level, newXP: currentXP, leveledUp };
}

export function logStudySession(durationSeconds: number, xpEarned: number, subjectId: number | null = null) {
  db.runSync(
    'INSERT INTO study_sessions (duration_seconds, xp_earned, subject_id) VALUES (?, ?, ?);',
    [durationSeconds, xpEarned, subjectId]
  );

  if (subjectId) {
    const attr = db.getFirstSync<Attribute>('SELECT * FROM subjects WHERE id = ?;', [subjectId]);
    if (attr) {
      let newXP = attr.current_xp + xpEarned;
      let newLevel = attr.level;
      let required = newLevel * 100;

      while (newXP >= required) {
        newXP -= required;
        newLevel += 1;
        required = newLevel * 100;
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
  return db.getAllSync<Task>('SELECT * FROM tasks ORDER BY id DESC;');
}

export function addTask(
  title: string,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  subjectId: number | null = null,
  repeatRule: string = 'once',
  targetMinutes: number = 30
) {
  const xp = targetMinutes * 10;
  const isRecurring = repeatRule !== 'once' ? 1 : 0;

  try {
    db.runSync(
      'INSERT INTO tasks (title, difficulty, xp_awarded, is_recurring, repeat_rule, target_minutes, subject_id) VALUES (?, ?, ?, ?, ?, ?, ?);',
      [title, difficulty, xp, isRecurring, repeatRule, targetMinutes, subjectId]
    );
  } catch (err: any) {
    if (err.message && err.message.includes('has no column named target_minutes')) {
      db.execSync('ALTER TABLE tasks ADD COLUMN target_minutes INTEGER DEFAULT 30;');
      db.runSync(
        'INSERT INTO tasks (title, difficulty, xp_awarded, is_recurring, repeat_rule, target_minutes, subject_id) VALUES (?, ?, ?, ?, ?, ?, ?);',
        [title, difficulty, xp, isRecurring, repeatRule, targetMinutes, subjectId]
      );
    } else {
      throw err;
    }
  }
}

export function updateTask(
  id: number,
  title: string,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  repeatRule: string = 'once',
  targetMinutes: number = 30
) {
  const xp = targetMinutes * 10;
  const isRecurring = repeatRule !== 'once' ? 1 : 0;

  db.runSync(
    'UPDATE tasks SET title = ?, difficulty = ?, xp_awarded = ?, is_recurring = ?, repeat_rule = ?, target_minutes = ? WHERE id = ?;',
    [title, difficulty, xp, isRecurring, repeatRule, targetMinutes, id]
  );
}

export function completeTask(taskId: number): { leveledUp: boolean; newLevel: number } {
  const task = db.getFirstSync<Task>('SELECT * FROM tasks WHERE id = ?;', [taskId]);
  if (!task || task.is_completed === 1) return { leveledUp: false, newLevel: 1 };

  db.runSync('UPDATE tasks SET is_completed = 1 WHERE id = ?;', [taskId]);
  const levelResult = addXPAndCheckLevelUp(task.xp_awarded);

  return { leveledUp: levelResult.leveledUp, newLevel: levelResult.newLevel };
}

export function uncompleteTask(taskId: number) {
  db.runSync('UPDATE tasks SET is_completed = 0 WHERE id = ?;', [taskId]);
}

export function deleteTask(taskId: number) {
  db.runSync('DELETE FROM tasks WHERE id = ?;', [taskId]);
}

export function getSubjects(): Attribute[] {
  return db.getAllSync<Attribute>('SELECT * FROM subjects ORDER BY id ASC;');
}

export function resetDatabase() {
  try {
    const today = new Date().toISOString().split('T')[0];

    db.execSync(`
      DELETE FROM study_sessions;
      DELETE FROM tasks;
      DELETE FROM sqlite_sequence WHERE name IN ('study_sessions', 'tasks');
      UPDATE user_profile 
      SET level = 1, current_xp = 0, streak_count = 1, last_active_date = '${today}' 
      WHERE id = 1;
      UPDATE subjects SET level = 1, current_xp = 0;
      VACUUM;
    `);
    console.log('Database successfully reset and vacuumed!');
  } catch (e) {
    console.error('Failed to reset database:', e);
  }
}