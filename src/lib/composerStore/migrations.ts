// Migration Service Implementation
// Handles backward compatibility with legacy pipe structures

import type { MigrationService } from './interfaces';
import type { PipeRow, PipeElement, GlobalElement, TimelineElement } from '$types';

export class MigrationServiceImpl implements MigrationService {
  migratePipe(pipe: PipeRow): PipeRow {
    // Ensure subjectReferences array exists (normalize for old data)
    if (!pipe.subjectReferences) {
      pipe.subjectReferences = [];
    }

    // If already has elements with proper structure, no migration needed
    if (pipe.elements && pipe.elements.length > 0) {
      return pipe;
    }

    // Migrate from old structure with segments and globalNodes
    const elements: PipeElement[] = [];

    // Check for legacy globalNodes (backward compatibility)
    const legacyPipe = pipe as any;
    if (legacyPipe.globalNodes && legacyPipe.globalNodes.length > 0) {
      for (const node of legacyPipe.globalNodes) {
        if (node.tag === 'global_style') {
          elements.push({
            id: node.id,
            tag: 'global_style',
            value: node.value || '',
            enabled: node.enabled !== false,
            frameStart: node.frameStart ?? 0,
            frameEnd: node.frameEnd ?? 240,
          });
        }
      }
    }

    // Check for legacy segments (backward compatibility)
    if (legacyPipe.segments && legacyPipe.segments.length > 0) {
      elements.push({
        id: crypto.randomUUID(),
        tag: 'timeline',
        segments: legacyPipe.segments.map((s: any) => ({
          id: s.id,
          frameStart: s.frameStart,
          frameEnd: s.frameEnd,
          tags: s.tags || [],
        })),
      });
    }

    return { ...pipe, elements };
  }
}
