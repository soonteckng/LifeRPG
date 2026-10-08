import { CHARACTER_LOOKS } from "../constants/characterLooks";
const legacyLooks: Record<string, string> = { "🧙": "🧙‍♂️", "🦊": "🏋️", "🐼": "🐱", "🐸": "🌱", "🐻": "🐱", "🦁": "🏋️", "🐰": "🎨", "🐧": "🧑‍💻", "🐲": "🌱" };
export function characterLook(avatar: string) {
  return CHARACTER_LOOKS.find(look => look.id === (legacyLooks[avatar] ?? avatar)) ?? CHARACTER_LOOKS[7];
}
export function characterAccent(avatar: string): string { return characterLook(avatar).accent; }
