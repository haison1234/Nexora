import { AI_DEPARTMENT_SECTIONS, parseAiDepartmentSection } from './department-navigation';

describe('AI Department navigation', () => {
	it('does not expose meeting navigation', () => {
		expect(AI_DEPARTMENT_SECTIONS).not.toContain('meetings');
		expect(AI_DEPARTMENT_SECTIONS).toContain('work');
		expect(parseAiDepartmentSection('meetings')).toBe('organization');
	});
});
