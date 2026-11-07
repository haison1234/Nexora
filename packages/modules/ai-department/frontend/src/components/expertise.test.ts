import { addExpertiseTag, EXPERTISE_LIMITS } from './expertise';

describe('addExpertiseTag', () => {
	it('adds a trimmed tag and collapses inner spaces', () => {
		expect(addExpertiseTag(['seo'], '  social   media ')).toEqual(['seo', 'social media']);
	});

	it('rejects empty, duplicate (any case), too long, and over-limit tags', () => {
		expect(addExpertiseTag([], '   ')).toBeNull();
		expect(addExpertiseTag(['SEO'], 'seo')).toBeNull();
		expect(addExpertiseTag([], 'x'.repeat(EXPERTISE_LIMITS.chars + 1))).toBeNull();
		expect(addExpertiseTag(['a', 'b', 'c', 'd', 'e'], 'f')).toBeNull();
	});
});
