/**
 * Regression: a URL pasted into the url-mode field must NOT bleed into the
 * txt2img / img2img prompt box when the user flips the mode tabs.
 *
 * KeyframeModal previously kept ONE shared `kfValue` for both the url field
 * and the prompt field, so typing a URL and then switching to "Txt2Img"
 * carried the URL into the prompt textarea. The url value and the prompt
 * value are now independent fields (`kfUrl` / `kfPrompt`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import type { PipeRow } from '$types';

// Keep the mount offline-friendly: the panel's listPieceHistory / generate
// call into Tauri + settings; mock both so the test is about the field
// separation, not IPC.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
  isTauri: vi.fn(() => false),
}));

import KeyframeModal from '$components/ComposerModals/KeyframeModal.svelte';

const pipe: PipeRow = {
  id: 'p1',
  name: 'Pipe 1',
  lengthFrames: 16,
  qValue: 0.5,
  cValue: 0.5,
  keyframes: [],
  subjectReferences: [],
  elements: [],
  orderIndex: 0,
} as unknown as PipeRow;

function open() {
  return render(KeyframeModal, {
    props: {
      pipe,
      sessionId: 's1',
      maxFrames: 16,
      editingSlot: 0,
      open: true,
    },
  });
}

describe('KeyframeModal url/prompt field separation', () => {
  afterEach(cleanup);

  it('does not carry a url-mode value into the txt2img prompt', () => {
    const { getByLabelText, getByRole } = open();
    // Type a URL into the url field (active while in url mode).
    const urlInput = getByLabelText('Image URL') as HTMLInputElement;
    fireEvent.input(urlInput, { target: { value: 'https://example.com/a.jpg' } });

    // Flip to the txt2img tab.
    fireEvent.click(getByRole('button', { name: 'Txt2Img' }));

    // The prompt textarea must be EMPTY — the URL must not have bled over.
    const prompt = getByLabelText('Prompt') as HTMLTextAreaElement;
    expect(prompt.value).toBe('');
    // The url field's value lives in its own state (still recoverable if the
    // user flips back), not in the prompt.
    fireEvent.click(getByRole('button', { name: 'URL' }));
    expect((getByLabelText('Image URL') as HTMLInputElement).value).toBe('https://example.com/a.jpg');
  });

  it('does not carry a url-mode value into the img2img prompt', () => {
    const { getByLabelText, getByRole } = open();
    fireEvent.input(getByLabelText('Image URL'), { target: { value: 'https://example.com/a.jpg' } });
    fireEvent.click(getByRole('button', { name: 'Img2Img' }));
    const prompt = getByLabelText('Prompt') as HTMLTextAreaElement;
    expect(prompt.value).toBe('');
  });
});
