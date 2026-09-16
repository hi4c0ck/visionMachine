// Settings library barrel (docs/settings-provider-tasks.md, Phase 2).
// Tiny, modular pieces re-exported for consumers:
//   - catalog.ts  preset/model-spec data (Agnes-first; concrete details fill later)
//   - guards.ts   defaults, normalization, URL/key/log security helpers
//   - store.ts    the shared Settings object + persistence + provider ping
//   - logs.ts     portable (redacted) generation-log access

export * from './catalog';
export * from './guards';
export * from './store';
export * from './logs';
