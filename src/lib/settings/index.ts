// Settings library barrel (docs/settings-provider-tasks.md, Phase 2).
// Tiny, modular pieces re-exported for consumers:
//   - catalog.ts      preset/model-spec data (Agnes-first; concrete details fill later)
//   - guards.ts       defaults, normalization, URL/key/log security helpers
//   - store.ts        the shared Settings object + persistence + provider ping
//   - logs.ts         portable (redacted) generation-log access
//   - prechecks.ts    pipe pre-checks + seconds preview (docs/provider-engine-tasks.md, Phase A)
//   - resolveSpecs.ts model spec resolution for a generation run

export * from './catalog';
export * from './guards';
export * from './store';
export * from './logs';
export * from './prechecks';
export * from './resolveSpecs';
