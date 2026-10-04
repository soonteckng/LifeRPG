// Display-only palette. Stored subject colours and category identity are unchanged.
// Blue replaces indigo/lavender so no area borrows the app's lavender accent.
const palette = ["#2DD4BF", "#F0997B", "#79BCE8", "#E8C26A", "#E58BB1"];
export function lifeAreaColor(id: number | null | undefined, saved?: string | null): string {
  if (saved && /^#[0-9a-f]{6}$/i.test(saved)) {
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
