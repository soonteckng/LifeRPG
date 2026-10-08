export type CharacterAccessory = "cap" | "leaves" | "band" | "headphones" | "beret" | "hood" | "antenna" | "sprout" | "star" | "ears" | "glasses" | "beanie";
export interface CharacterLook {
  id: string; title: string; detail: string; head: string; body: string;
  shade: string; accent: string; ink: string; accessory: CharacterAccessory;
}
// Existing saved avatar values remain the identifiers; no profile migration.
export const CHARACTER_LOOKS: readonly CharacterLook[] = [
  { id: "🧙‍♂️", title: "Starlight", detail: "A little wonder", head: "#E0D7FC", body: "#9084CC", shade: "#7064A6", accent: "#C4B4FF", ink: "#42375D", accessory: "cap" },
  { id: "🧝‍♂️", title: "Fern", detail: "A softer rhythm", head: "#DAEFE1", body: "#86B99A", shade: "#648A73", accent: "#A5DFBD", ink: "#345341", accessory: "leaves" },
  { id: "🏋️", title: "Ember", detail: "A warm spark", head: "#F8DFD5", body: "#DD9D85", shade: "#AA7563", accent: "#FFB49A", ink: "#603E34", accessory: "band" },
  { id: "🧑‍💻", title: "Orbit", detail: "Curious by nature", head: "#D3E8FC", body: "#85B2D7", shade: "#5C83A9", accent: "#A0D6FF", ink: "#2F4E6D", accessory: "headphones" },
  { id: "🎨", title: "Muse", detail: "Room to create", head: "#F4DCEB", body: "#CA8EAF", shade: "#9D6885", accent: "#F1B2D5", ink: "#593449", accessory: "beret" },
  { id: "🥷", title: "Midnight", detail: "Quiet confidence", head: "#B6C8E0", body: "#667793", shade: "#4A576D", accent: "#96ACD3", ink: "#293A51", accessory: "hood" },
  { id: "🤖", title: "Circuit", detail: "Small discoveries", head: "#D0ECE9", body: "#83B9B5", shade: "#608E8A", accent: "#9DE2D9", ink: "#2E5552", accessory: "antenna" },
  { id: "🌱", title: "Sprout", detail: "One day at a time", head: "#D9EEE8", body: "#88C2AF", shade: "#63A28D", accent: "#86E0BA", ink: "#33594A", accessory: "sprout" },
  { id: "⭐", title: "Nova", detail: "A bright beginning", head: "#E1E0FF", body: "#9E9ADB", shade: "#7773AF", accent: "#BAB4FF", ink: "#444064", accessory: "star" },
  { id: "🐱", title: "Luna", detail: "A curious companion", head: "#EDDFEF", body: "#B699BF", shade: "#8D7498", accent: "#D8BCE4", ink: "#514056", accessory: "ears" },
  { id: "📖", title: "Pebble", detail: "A thoughtful little friend", head: "#E8E6DF", body: "#A8AAAB", shade: "#777F86", accent: "#D0D5E2", ink: "#414956", accessory: "glasses" },
  { id: "☁️", title: "Cloud", detail: "Take it at your own pace", head: "#E0F0FB", body: "#A2C5E4", shade: "#7B9DBF", accent: "#C4E3F5", ink: "#3C5F7B", accessory: "beanie" },
];
