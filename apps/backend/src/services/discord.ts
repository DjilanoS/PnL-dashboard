/** Minimal Discord user profile from GET https://discord.com/api/users/@me. */
export interface DiscordProfile {
  /** Stable Discord user id — what we key the account on. */
  id: string;
  /** Unique username (post-migration). */
  username: string;
  /** Display name; preferred over `username` when present. */
  global_name?: string | null;
  /** Avatar hash, or null for the default avatar. */
  avatar: string | null;
}

/**
 * Fetch the Discord user for an OAuth access token. Throws on a non-2xx
 * response so the callback can fail closed and redirect with an error.
 */
export async function fetchDiscordUser(accessToken: string): Promise<DiscordProfile> {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('discord_profile_fetch_failed');
  const profile = (await res.json()) as DiscordProfile;
  // Fail closed if the upsert key is missing: a {discordId: undefined} query
  // could otherwise match an unrelated user, binding the JWT to the wrong account.
  if (!profile || typeof profile.id !== 'string' || profile.id.length === 0) {
    throw new Error('discord_profile_missing_id');
  }
  return profile;
}

/** Discord display name: prefer the new global_name, fall back to username. */
export function discordDisplayName(p: DiscordProfile): string {
  return p.global_name?.trim() || p.username;
}
