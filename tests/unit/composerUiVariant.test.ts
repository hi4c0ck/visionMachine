import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	getComposerUiVariant,
	setComposerUiVariant,
	type ComposerUiVariant,
} from '../../src/lib/composerUiVariant';

describe('composerUiVariant', () => {
	const KEY = 'vm-composer-ui-variant';

	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
	});

	it('defaults to fixed (the reference variant) when nothing is stored', () => {
		expect(getComposerUiVariant()).toBe('fixed');
	});

	it('round-trips a fixed choice through storage', () => {
		setComposerUiVariant('fixed');
		expect(localStorage.getItem(KEY)).toBe('fixed');
		expect(getComposerUiVariant()).toBe('fixed');
	});

	it('round-trips a current choice through storage', () => {
		setComposerUiVariant('current');
		expect(localStorage.getItem(KEY)).toBe('current');
		expect(getComposerUiVariant()).toBe('current');
	});

	it('treats unknown/legacy stored values as the default (fixed)', () => {
		localStorage.setItem(KEY, 'mystery');
		expect(getComposerUiVariant()).toBe('fixed');
	});
});
