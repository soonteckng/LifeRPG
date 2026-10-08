// Bright category cues sit on neutral black surfaces.
const palette = ["#6DD4B5", "#F4AA88", "#79BFF2", "#AAB3FF", "#E98ABC", "#C1A8FA"];
export function lifeAreaColor(id: number | null | undefined, saved?: string | null): string {
  if (saved && /^#[0-9a-f]{6}$/i.test(saved)) {
    if (palette.includes(saved.toUpperCase())) return saved.toUpperCase();
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
