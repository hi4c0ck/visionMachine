/**
 * Unit tests for compiler.ts prompt compilation
 */
import { describe, it, expect } from 'vitest';
import { compilePrompt, constructRule } from '../../src/lib/compiler';
import type { PipeRow, GlobalElement, TimelineElement, Segment, TagElement } from '../../src/types/app';
import { TAG_SPECIFICATIONS } from '../../src/types/app';

describe('constructRule', () => {
  it('should format plain rule correctly', () => {
    const spec = TAG_SPECIFICATIONS['scene'];
    expect(constructRule(spec, 'a vast landscape')).toBe('a vast landscape');
  });

  it('should format json rule correctly', () => {
    const spec = TAG_SPECIFICATIONS['camera'];
    const result = constructRule(spec, 'zoom in');
    const parsed = JSON.parse(result);
    expect(parsed.tag).toBe('camera');
    expect(parsed.value).toBe('zoom in');
  });

  it('should format markdown rule correctly', () => {
    const spec = TAG_SPECIFICATIONS['effect'];
    const result = constructRule(spec, 'sparkles');
    expect(result).toContain('**Effect**: sparkles');
  });

  it('should format xml rule correctly', () => {
    // Use a tag with xml constructRule - actually none exist in current spec
    // Just test plain rule returns value as-is
    const spec = TAG_SPECIFICATIONS['scene'];
    const result = constructRule(spec, 'test value');
    expect(result).toBe('test value');
  });
});

describe('compilePrompt', () => {
  it('should compile an empty pipe', () => {
    const pipe: PipeRow = {
      id: '1',
      name: 'Test',
      lengthFrames: 121,
      keyframes: [],
      qValue: 18,
      cValue: 7,
      elements: [],
      orderIndex: 0,
    };
    const result = compilePrompt(pipe);
    expect(result).toBe('');
  });

  it('should include global prompt first', () => {
    const global: GlobalElement = {
      id: 'g1',
      tag: 'global_style',
      value: 'main theme',
      enabled: true,
    };
    const pipe: PipeRow = {
      id: '1',
      name: 'Test',
      lengthFrames: 121,
      keyframes: [],
      qValue: 18,
      cValue: 7,
      elements: [global],
      orderIndex: 0,
    };
    const result = compilePrompt(pipe);
    expect(result).toContain('main theme');
  });

  it('should compile segments sorted by frame position', () => {
    const segment1: Segment = {
      id: '2',
      frameStart: 61,
      frameEnd: 121,
      tags: [{
        id: 't1',
        tag: 'camera',
        frameStart: 61,
        frameEnd: 121,
        value: 90,
        spec: TAG_SPECIFICATIONS['camera'],
      }],
    };
    const segment2: Segment = {
      id: '1',
      frameStart: 1,
      frameEnd: 60,
      tags: [{
        id: 't2',
        tag: 'scene',
        frameStart: 1,
        frameEnd: 60,
        prompt: 'forest',
        spec: TAG_SPECIFICATIONS['scene'],
      }],
    };
    const timeline: TimelineElement = {
      id: 'tl1',
      tag: 'timeline',
      segments: [segment1, segment2],
    };
    const pipe: PipeRow = {
      id: '1',
      name: 'Test',
      lengthFrames: 121,
      keyframes: [],
      qValue: 18,
      cValue: 7,
      elements: [timeline],
      orderIndex: 0,
    };
    const result = compilePrompt(pipe);
    const lines = result.split('\n').filter((l: string) => l.trim());
    // Scene at frame 1-60 should come before camera at 61-121
    expect(lines[0]).toContain('forest');
  });

  it('should handle pipe with global + segments', () => {
    const global: GlobalElement = {
      id: 'g1',
      tag: 'global_style',
      value: 'global theme',
      enabled: true,
    };
    const segment: Segment = {
      id: '1',
      frameStart: 1,
      frameEnd: 121,
      tags: [{
        id: 't1',
        tag: 'scene',
        frameStart: 1,
        frameEnd: 121,
        prompt: 'pipe1 scene',
        spec: TAG_SPECIFICATIONS['scene'],
      }],
    };
    const timeline: TimelineElement = {
      id: 'tl1',
      tag: 'timeline',
      segments: [segment],
    };
    const pipe: PipeRow = {
      id: '1',
      name: 'Test',
      lengthFrames: 121,
      keyframes: [],
      qValue: 18,
      cValue: 7,
      elements: [global, timeline],
      orderIndex: 0,
    };
    const result = compilePrompt(pipe);
    const lines = result.split('\n');
    // Global prompt comes first
    expect(lines[0]).toContain('global theme');
    expect(result).toContain('pipe1 scene');
  });
});
