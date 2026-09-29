export const SESSION_ACTIVITIES = [
  { id: "study", label: "Study", icon: "📚" },
  { id: "work", label: "Work", icon: "💼" },
  { id: "code", label: "Code", icon: "💻" },
  { id: "exercise", label: "Exercise", icon: "🏋️" },
  { id: "read", label: "Read", icon: "📖" },
  { id: "create", label: "Create", icon: "🎨" },
  { id: "organize", label: "Organize", icon: "🧹" },
  { id: "relax", label: "Relax", icon: "🧘" },
  { id: "other", label: "Other", icon: "✨" },
] as const;

export function formatSessionActivity(activity: string): string {
  const match = SESSION_ACTIVITIES.find(
    (item) => item.id === activity,
  );

  if (match) {
    return match.label;
  }

  // Keep legacy sessions readable without changing old data.
  if (activity === "general") {
    return "Other";
  }

  return activity
    ? activity.charAt(0).toUpperCase() + activity.slice(1)
    : "Other";
}
