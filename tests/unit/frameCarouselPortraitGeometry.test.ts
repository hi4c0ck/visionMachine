/**
 * DOM-level geometry test: mount the real FrameCarousel.svelte with a
 * portrait (9:16) videoAspect and assert the center card renders at
 * exactly 101×180px (true video aspect at the 180px strip height) —
 * NOT a crop or letterbox. Proves the aspect-aware card sizing end-to-end.
 */
import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { afterEach } from 'vitest';
import FrameCarousel from '$components/FrameCarousel.svelte';
import { carouselCardWidth } from '$lib/frameDecoder';

afterEach(cleanup);

describe('FrameCarousel portrait card geometry (DOM)', () => {
  it('sizes the center card to the true 9:16 aspect at the strip height', () => {
    const { container } = render(FrameCarousel, {
      props: {
        video: { url: 'blob:portrait', label: 'v' },
        videoEl: null,
        totalFrames: 241,
        fps: 24,
        frame: 0,
        videoAspect: 720 / 1280,
        onframeSelect: () => {},
        onexit: () => {},
      },
    });
    const center = container.querySelector('.fc-card.fc-center');
    expect(center, 'center card mounted').toBeTruthy();
    const w = parseInt((center as HTMLElement).style.width, 10);
    expect(w).toBe(carouselCardWidth(180, 720 / 1280)); // 101
    expect(w).toBe(101);
    // --fc-card-w drives the video layer + drag consistently off the same width.
    const strip = container.querySelector('.fc-strip') as HTMLElement;
    expect(strip.style.getPropertyValue('--fc-card-w').trim()).toBe('101px');
  });

  it('landscape aspect produces a wide card (not the 170px fallback)', () => {
    const { container } = render(FrameCarousel, {
      props: {
        video: { url: 'blob:landscape', label: 'h' },
        videoEl: null,
        totalFrames: 241,
        fps: 24,
        frame: 0,
        videoAspect: 16 / 9,
        onframeSelect: () => {},
        onexit: () => {},
      },
    });
    const center = container.querySelector('.fc-card.fc-center') as HTMLElement;
    expect(parseInt(center.style.width, 10)).toBe(320); // 180 * 16/9
  });
});
