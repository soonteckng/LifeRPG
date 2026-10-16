const PREFIX = "liferpg:routine:v1:";

function validName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 80
    && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}

/** A display label in the existing notes field, never a quest or reward claim. */
export function encodeRoutineSession(name: string): string | null {
  return validName(name) ? PREFIX + JSON.stringify({ name }) : null;
}

export function readRoutineSession(notes: unknown): string | null {
  if (typeof notes !== "string" || notes.length > 512 || !notes.startsWith(PREFIX)) return null;
  try {
    const value: unknown = JSON.parse(notes.slice(PREFIX.length));
    if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).length !== 1 || !("name" in value) || !validName(value.name)) return null;
    return value.name;
  } catch { return null; }
}
