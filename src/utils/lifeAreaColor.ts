// Calm, deep category cues that stay readable on warm paper.
const palette = ["#3F7A5A", "#B4651E", "#2E6A9E", "#5A4FA0", "#A84569", "#7A4C9C"];
// Colours saved by earlier palettes keep their place in this one.
const earlier = [
  ["#30D158", "#FF9F0A", "#64D2FF", "#5E5CE6", "#FF6482", "#BF5AF2"],
  ["#6DD4B5", "#F4AA88", "#79BFF2", "#AAB3FF", "#E98ABC", "#C1A8FA"],
];
export function lifeAreaColor(id: number | null | undefined, saved?: string | null): string {
  if (saved && /^#[0-9a-f]{6}$/i.test(saved)) {
    const code = saved.toUpperCase();
    if (palette.includes(code)) return code;
    for (const old of earlier) if (old.includes(code)) return palette[old.indexOf(code)];
    const rgb = [1, 3, 5].map(offset => parseInt(saved.slice(offset, offset + 2), 16) / 255);
    const [red, green, blue] = rgb;
    const max = Math.max(...rgb), min = Math.min(...rgb), delta = max - min;
    if (delta > 0.05) {
      let hue = max === red ? ((green - blue) / delta) % 6 : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
      hue = (hue * 60 + 360) % 360;
      if (hue < 25 || hue >= 345) return palette[1];
      if (hue < 85) return palette[3];
      if (hue < 190) return palette[0];
      if (hue < 280) return palette[2];
      return palette[4];
    }
  }
  return id == null ? palette[3] : palette[Math.abs(Math.floor(id)) % palette.length];
}

// A soft fill behind an area's icon: the area colour at low opacity.
export function areaTint(hex: string, alpha = 0.12): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return `rgba(42,32,40,${alpha})`;
  const [red, green, blue] = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  return `rgba(${red},${green},${blue},${alpha})`;
}
