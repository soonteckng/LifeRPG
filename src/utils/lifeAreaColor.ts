const palette = ["#38C9B3", "#F29D82", "#B7ABEC", "#79BCE8", "#E5BD72", "#D894BB"];
export function lifeAreaColor(id: number | null | undefined, saved?: string | null): string {
  if (saved && /^#[0-9a-f]{6}$/i.test(saved)) return saved;
  return id == null ? "#A5B4FC" : palette[Math.abs(Math.floor(id)) % palette.length];
}
