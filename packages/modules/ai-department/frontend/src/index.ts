// The module's only public entry. The shell imports the descriptor from here via
// `modules.manifest.ts`; anything else the shell (or a test) needs must be exported
// here too — deep paths into `src/` are not part of the contract.
export { AiDepartmentModule } from './ai-department.module';
export { AI_DEPARTMENT_HOME_VIEW } from './ai-department.constants';
export { useAiDepartmentStore } from './ai-department.store';
