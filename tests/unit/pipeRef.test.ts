/**
 * Pipe-reference bridge (bug batch nov19, items 1+4).
 *
 * The store mutates plain objects in place; Svelte 5 deriveds short-circuit
 * on stable references, so pipe-subtree consumers (previews, keyframe chips)
 * froze after generation terminal / keyframe confirm. touchPipeShells is the
 * single choke point (notifyUpdate) that replaces the pipes array with
 * shallow pipe shells so the keyed each + child prop equality propagate.
 */
import { describe, it, expect } from 'vitest';
import { touchPipeShells } from '$lib/composerStore/pipeRef';
import type { SessionData } from '$types';

function mockSession(): SessionData {
	return {
		id: 's1',
		name: 'S',
		pipes: [
			{
				id: 'p1',
				name: 'Pipe 1',
				lengthFrames: 121,
				qValue: 18,
				cValue: 7,
				orderIndex: 0,
				keyframes: [{ id: 'kf1' }],
				subjectReferences: [],
				elements: [{ id: 'el1', tag: 'global_style' }],
			},
			{
				id: 'p2',
				name: 'Pipe 2',
				lengthFrames: 121,
				qValue: 18,
				cValue: 7,
				orderIndex: 1,
				keyframes: [],
				subjectReferences: [],
				elements: [],
			},
		],
	} as unknown as SessionData;
}

describe('touchPipeShells', () => {
	it('replaces the array AND every pipe shell (new references)', () => {
		const session = mockSession();
		const oldArray = session.pipes;
		const oldP1 = session.pipes[0];
		const oldP2 = session.pipes[1];

		touchPipeShells(session);

		expect(session.pipes).not.toBe(oldArray);
		expect(session.pipes[0]).not.toBe(oldP1);
		expect(session.pipes[1]).not.toBe(oldP2);
	});

	it('preserves ids and field values (shallow, not a rewrite)', () => {
		const session = mockSession();
		touchPipeShells(session);
		expect(session.pipes[0].id).toBe('p1');
		expect(session.pipes[0].qValue).toBe(18);
		expect(session.pipes[1].name).toBe('Pipe 2');
		expect(session.pipes).toHaveLength(2);
	});

	it('shares nested data — no deep clone (anti-heap-ratchet invariant)', () => {
		const session = mockSession();
		const kfArray = session.pipes[0].keyframes;
		const elArray = session.pipes[0].elements;
		touchPipeShells(session);
		expect(session.pipes[0].keyframes).toBe(kfArray);
		expect(session.pipes[0].elements).toBe(elArray);
	});

	it('an empty session still gets a fresh array (add-pipe propagates)', () => {
		const session = { id: 's', pipes: [] } as unknown as SessionData;
		const old = session.pipes;
		touchPipeShells(session);
		expect(session.pipes).not.toBe(old);
		expect(session.pipes).toHaveLength(0);
	});
});