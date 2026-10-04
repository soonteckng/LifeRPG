// Visual identity only: changing a badge never alters earned progression.
const accents: Record<string, string> = {
  "🌱": "#38C9B3", "🧝‍♂️": "#8FD8B6", "🏋️": "#F29D82", "🧑‍💻": "#79BCE8", "🎨": "#D894BB", "🥷": "#B7ABEC", "🤖": "#79BCE8", "⭐": "#E5BD72", "🧙‍♂️": "#B7ABEC", "🧙": "#B7ABEC", "🦊": "#F29D82",
  "🐱": "#E5BD72", "🐼": "#A5B4FC", "🐸": "#8FD8B6", "🐻": "#E5BD72",
  "🦁": "#F29D82", "🐰": "#D894BB", "🐧": "#79BCE8", "🐲": "#38C9B3",
};
export function characterAccent(avatar: string): string { return accents[avatar] ?? "#A5B4FC"; }
