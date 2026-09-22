import { supabase } from "../../lib/supabase";

export interface Subject {
  id: number;
  title: string;
  level: number;
  current_xp: number;
  color_code: string | null;
}

export interface Task {
  id: number;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  is_completed: boolean;
  xp_awarded: number;
  is_recurring: boolean;
  repeat_rule: string;
  target_minutes: number;
  subject_id: number | null;
  last_completed_date: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;

  // Derived locally for the UI.
  is_due_today: boolean;
  is_completed_today: boolean;
}

export interface CreateTaskParams {
  title: string;
  targetMinutes: number;
  subjectId?: number | null;
  repeatRule?: string;
  difficulty?: "easy" | "medium" | "hard";
}

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

function getTodayShortName(): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[new Date().getDay()];
}

function isTaskDueToday(
  isRecurring: boolean,
  repeatRule: string,
): boolean {
  if (!isRecurring) {
    return true;
  }

  if (repeatRule === "daily") {
    return true;
  }

  if (!repeatRule || repeatRule === "once") {
    return false;
  }

  const selectedDays = repeatRule
    .split(",")
    .map((day) => day.trim())
    .filter(Boolean);

  return selectedDays.includes(getTodayShortName());
}

function mapTask(row: any): Task {
  const today = getToday();

  const isRecurring = Boolean(row.is_recurring);

  const isCompletedToday = isRecurring
    ? row.last_completed_date === today
    : Boolean(row.is_completed);

  return {
    id: Number(row.id),
    title: row.title,
    difficulty: row.difficulty,
    is_completed: Boolean(row.is_completed),
    xp_awarded: Number(row.xp_awarded ?? 0),
    is_recurring: isRecurring,
    repeat_rule: row.repeat_rule ?? "once",
    target_minutes: Number(row.target_minutes ?? 30),
    subject_id:
      row.subject_id === null || row.subject_id === undefined
        ? null
        : Number(row.subject_id),
    last_completed_date: row.last_completed_date ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at ?? null,

    is_due_today: isTaskDueToday(
      isRecurring,
      row.repeat_rule ?? "once",
    ),

    is_completed_today: isCompletedToday,
  };
}

async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error("You must be signed in.");
  }

  return user.id;
}

export async function getSubjects(): Promise<Subject[]> {
  const { data, error } = await supabase
    .from("subjects")
    .select(
      "id, title, level, current_xp, color_code",
    )
    .order("title", { ascending: true });

  if (error) {
    console.error("Failed to load subjects:", error);
    throw error;
  }

  const subjects = (data ?? []).map((row) => ({
    id: Number(row.id),
    title: row.title,
    level: Number(row.level ?? 1),
    current_xp: Number(row.current_xp ?? 0),
    color_code: row.color_code ?? null,
  }));

  // Keep General first because it is the lowest-friction default.
  subjects.sort((a, b) => {
    if (a.title === "General") return -1;
    if (b.title === "General") return 1;
    return a.title.localeCompare(b.title);
  });

  return subjects;
}

export async function getTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, title, difficulty, is_completed, xp_awarded, is_recurring, repeat_rule, target_minutes, subject_id, last_completed_date, created_at, updated_at, completed_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load tasks:", error);
    throw error;
  }

  const tasks = (data ?? []).map(mapTask);

  // Put today's actionable quests first.
  tasks.sort((a, b) => {
    if (a.is_due_today !== b.is_due_today) {
      return a.is_due_today ? -1 : 1;
    }

    if (a.is_completed_today !== b.is_completed_today) {
      return a.is_completed_today ? 1 : -1;
    }

    return (
      new Date(b.created_at).getTime() -
      new Date(a.created_at).getTime()
    );
  });

  return tasks;
}

export async function createTask({
  title,
  targetMinutes,
  subjectId = null,
  repeatRule = "once",
  difficulty = "medium",
}: CreateTaskParams): Promise<Task> {
  const userId = await getCurrentUserId();

  const cleanTitle = title.trim();

  if (!cleanTitle) {
    throw new Error("Quest title is required.");
  }

  const duration = Math.max(
    1,
    Math.min(480, Math.round(targetMinutes)),
  );

  const isRecurring = repeatRule !== "once";

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: userId,
      title: cleanTitle,
      difficulty,
      is_completed: false,
      xp_awarded: duration,
      is_recurring: isRecurring,
      repeat_rule: repeatRule,
      target_minutes: duration,
      subject_id: subjectId,
      last_completed_date: null,
    })
    .select(
      "id, title, difficulty, is_completed, xp_awarded, is_recurring, repeat_rule, target_minutes, subject_id, last_completed_date, created_at, updated_at, completed_at",
    )
    .single();

  if (error) {
    console.error("Failed to create task:", error);
    throw error;
  }

  return mapTask(data);
}

export async function updateTask(
  taskId: number,
  {
    title,
    targetMinutes,
    subjectId = null,
    repeatRule = "once",
    difficulty = "medium",
  }: CreateTaskParams,
): Promise<Task> {
  const userId = await getCurrentUserId();

  const cleanTitle = title.trim();

  if (!cleanTitle) {
    throw new Error("Quest title is required.");
  }

  const duration = Math.max(
    1,
    Math.min(480, Math.round(targetMinutes)),
  );

  const isRecurring = repeatRule !== "once";

  const { data, error } = await supabase
    .from("tasks")
    .update({
      title: cleanTitle,
      difficulty,
      xp_awarded: duration,
      is_recurring: isRecurring,
      repeat_rule: repeatRule,
      target_minutes: duration,
      subject_id: subjectId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .eq("user_id", userId)
    .select(
      "id, title, difficulty, is_completed, xp_awarded, is_recurring, repeat_rule, target_minutes, subject_id, last_completed_date, created_at, updated_at, completed_at",
    )
    .single();

  if (error) {
    console.error("Failed to update task:", error);
    throw error;
  }

  return mapTask(data);
}

export async function deleteTask(
  taskId: number,
): Promise<void> {
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("user_id", userId);

  if (error) {
    console.error("Failed to delete task:", error);
    throw error;
  }
}

export async function setTaskCompletion(
  task: Task,
  completed: boolean,
): Promise<Task> {
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();
  const today = getToday();

  const { data, error } = await supabase
    .from("tasks")
    .update({
      is_completed: completed,
      last_completed_date: completed ? today : null,
      completed_at: completed ? now : null,
      updated_at: now,
    })
    .eq("id", task.id)
    .eq("user_id", userId)
    .select(
      "id, title, difficulty, is_completed, xp_awarded, is_recurring, repeat_rule, target_minutes, subject_id, last_completed_date, created_at, updated_at, completed_at",
    )
    .single();

  if (error) {
    console.error("Failed to update task completion:", error);
    throw error;
  }

  return mapTask(data);
}