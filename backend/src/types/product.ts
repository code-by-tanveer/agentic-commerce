// Thin re-export of the shared `@agentic/events` workspace package.
//
// Cycle 7 polish — Architect T1.24: the product / variant / reasoning-chip /
// merchant-info TypeScript types are inferred from the Zod schemas in
// `@agentic/events` and re-exported here so the legacy
// `from '../types/product.js'` import paths inside `backend/src/` keep
// working without churn. The FE engineer mirrors this pattern in
// `frontend/types/product.ts` — both sides now narrow to a single source.

export type {
  NormalizedProduct,
  NormalizedVariant,
  ReasoningChip,
  MerchantInfo,
} from '@agentic/events';
