export const PROFILE_NAME_LIMIT = 15;
export const PROFILE_NAME_TAKEN = "That name is taken. Try adding a number or a nickname.";
export function profileNameError(name: string) {
  if (!name.trim() || name.trim().length > PROFILE_NAME_LIMIT) return `Enter a name between 1 and ${PROFILE_NAME_LIMIT} characters.`;
  // "@" is kept for emails, so a name can always be told apart at sign-in.
  if (name.includes("@")) return "Names can’t include @. That’s kept for emails.";
  return null;
}
