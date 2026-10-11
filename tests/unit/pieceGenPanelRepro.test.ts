/**
 * Regression: mounting PieceGenPanel (the keyframe / subject "Generate" panel,
 * shown in the modal's prompt section for txt2img / img2img) must not trip
 * Svelte's `effect_update_depth_exceeded` guard.
 *
 * The image-model seeding $effect reassigns the imageModels $state (a fresh
 * array each pass) in the same body where it reads it, which re-invalidates
 * the effect until Svelte aborts the flush with effect_update_depth_exceeded
 * (the "frozen window / modal never appears" symptom). GenerateModal guards
 * this exact pattern with a modelSeedKey; PieceGenPanel had to do the same.
 * Without the guard, a mount in txt2img mode throws synchronously.
 */
import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { afterEach } from 'vitest';
import PieceGenPanel from '$components/ComposerModals/PieceGenPanel.svelte';

afterEach(cleanup);

describe('PieceGenPanel mount (effect_update_depth_exceeded regression)', () => {
  it('mounts in txt2img mode and seeds the model picker without looping', () => {
    // Without the seed guard this mount throws effect_update_depth_exceeded.
    const { container, getByRole } = render(PieceGenPanel, {
      props: {
        kind: 'keyframe',
        refId: 'kf-slot1',
        sessionId: 's1',
        pipeId: 'p1',
        imageType: 'txt2img',
        prompt: 'a mountain',
        onGenerated: () => {},
      },
    });
    // The image-model select must be present and seeded (at least the
    // defaults' image models are non-pending / non-readOnly).
    const select = container.querySelector('.pg-select select') as HTMLSelectElement;
    expect(select, 'image-model select mounted').toBeTruthy();
    expect(select.options.length, 'model picker seeded').toBeGreaterThan(0);
    expect(getByRole('button', { name: /generate/i })).toBeTruthy();
  });

  it('mounts in img2img mode (source + generated previews) without looping', () => {
    const { getByText } = render(PieceGenPanel, {
      props: {
        kind: 'subject',
        refId: 'sr-new1',
        sessionId: 's1',
        pipeId: 'p1',
        imageType: 'img2img',
        prompt: '',
        referenceUrl: 'https://example.com/ref.jpg',
        onGenerated: () => {},
      },
    });
    // img2img shows BOTH the source and generated previews.
    expect(getByText('Source')).toBeTruthy();
    expect(getByText('Generated')).toBeTruthy();
  });
});
