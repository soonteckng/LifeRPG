export const PROFILE_NAME_LIMIT = 15;
export function profileNameError(name: string) {
  return !name.trim() || name.trim().length > PROFILE_NAME_LIMIT ? `Enter a name between 1 and ${PROFILE_NAME_LIMIT} characters.` : null;
}
