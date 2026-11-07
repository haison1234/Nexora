/** Mirrors the server limits. The server stays the authority and normalizes again. */
export const EXPERTISE_LIMITS = { tags: 5, chars: 64 } as const;

/** Returns the tag list with `raw` added, or null when it is empty, a duplicate, too long, or the list is full. */
export function addExpertiseTag(tags: string[], raw: string): string[] | null {
	const tag = raw.trim().replace(/\s+/g, ' ');
	if (!tag || tag.length > EXPERTISE_LIMITS.chars || tags.length >= EXPERTISE_LIMITS.tags) {
		return null;
	}
	const key = tag.toLocaleLowerCase();
	if (tags.some((existing) => existing.toLocaleLowerCase() === key)) return null;
	return [...tags, tag];
}
