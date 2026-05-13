// Thin re-export of the shared `@agentic/events` workspace package.
//
// Cycle 6 unified the BE and FE event schemas into a single source of truth
// at `packages/events/`. This file is preserved as a re-export so the
// existing `from '../stream/events.js'` import paths inside `backend/src/`
// keep working without a churn edit.

export * from '@agentic/events';
