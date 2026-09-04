# Composer Store Decoupling Architecture (2026-09-04)

## Summary
Decoupled monolithic `composerStore.ts` (652 lines, 31 functions) into focused service layer with interfaces.

## Pattern Applied

### Before
```
src/lib/composerStore.ts          # 652 lines, 31 exports
├── pipe CRUD
├── element CRUD
├── segment CRUD
├── tag CRUD
├── keyframe CRUD
├── session I/O
└── migration helpers
```

### After
```
src/lib/composerStore/
├── interfaces.ts    # Service interfaces (7 protocols)
├── validators.ts    # Frame math validation (8n+1 rule)
├── pipes.ts         # PipeServiceImpl
├── elements.ts      # ElementServiceImpl
├── segments.ts      # SegmentServiceImpl
├── tags.ts          # TagServiceImpl
├── keyframes.ts     # KeyframeServiceImpl
├── session-io.ts    # SessionServiceImpl
├── migrations.ts    # MigrationServiceImpl
└── index.ts         # ComposerStoreImpl (orchestrator + re-exports)
```

## Test Mocking Pattern

Critical: mock Tauri `invoke` BEFORE imports that use it. Use `vi.hoisted()` to hoist mock declaration:

```typescript
import { vi } from 'vitest';

const mockInvokeModule = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvokeModule.invoke(...args),
}));

import { sessions, addPipe, ... } from '../../src/lib/composerStore';
```

## Service Result Pattern

All services return consistent error collection:

```typescript
type ServiceResult = {
  errors: string[];  // Empty on success
};
```

## Interface Protocols

```typescript
interface PipeService { add(sessionId): Promise<ServiceResult>; remove(...): ... }
interface ElementService { addGlobalElement(...): ...; addTimelineElement(...): ... }
interface SegmentService { add(...): ...; remove(...): ...; resize(...): ... }
interface TagService { add(...): ...; remove(...): ...; resize(...): ... }
interface KeyframeService { add(...): ...; remove(...): ...; move(...): ... }
interface SessionService { hydrateSessions(): ...; loadSession(...): ...; saveSession(...): ... }
interface MigrationService { migratePipe(pipe): PipeRow; }
```

## Key Learnings

1. **Interface Segregation**: Each service handles one domain concept
2. **Validation Encapsulation**: Frame math rules live in `validators.ts`
3. **Orchestrator Pattern**: `ComposerStoreImpl` wires services, holds shared state
4. **Testability**: Mock at module level via `vi.hoisted()`
