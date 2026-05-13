// Thin re-export of the shared `@agentic/events` workspace package.
//
// Cycle 6 unified the BE and FE event schemas into a single source of truth
// at `packages/events/`. This file is preserved as a re-export so the
// existing `from '@/lib/events'` import paths inside `frontend/` keep
// working without a churn edit.

export * from '@agentic/events';
