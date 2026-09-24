<script lang="ts">
  import type { PipeRow, SessionData } from '$types';
  import { APP_CONSTANTS } from '$constants';
  import { getSettings } from '$lib/settings';
  import { getPreset, getModel, modelsFor, pipePrechecks, resolveSpecs } from '$lib/settings';
  import type { ModelSelection } from './GenerateModal.svelte';
  import '../composer-modal.css';
  let { open = $bindable(false), session, pipes, onConfirm } = $props<{ open: boolean; session: SessionData; pipes: PipeRow[]; onConfirm: (models: ModelSelection, seed: number | null, policy: 'stop' | 'continue', autoCompose: boolean) => Promise<void> | void }>();
  let policy = $state<'stop' | 'continue'>('stop');
  let autoCompose = $state(true);
  let imageModel = $state(''); let videoModel = $state(''); let seed = $state<number | null>(null);
  $effect(() => { const s = getSettings(); imageModel = s.providers.image.model; videoModel = s.providers.video.model; });
  const pair = $derived(resolveSpecs(imageModel, videoModel));
  const rows = $derived(pipes.map((pipe: PipeRow) => ({ pipe, conflicts: pipePrechecks(pipe, session, pair.image?.spec ?? null, pair.video?.spec ?? null) })));
  const canStart = $derived(pipes.length > 0 && (policy === 'continue' || rows.every((r: { conflicts: unknown[] }) => r.conflicts.length === 0)));
  async function confirm() { if (canStart) await onConfirm({ imageModel, videoModel }, seed, policy, autoCompose); }
</script>
{#if open}
  <div class="modal-overlay" role="presentation" onclick={() => (open = false)}>
    <div class="modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header"><h3>{APP_CONSTANTS.strings.sessionGenerate}</h3><span class="modal-sub">{APP_CONSTANTS.strings.sessionGenerateHint}</span></div>
      <div class="modal-body">
        {#each rows as row}
          <div class="gen-presets"><strong>{row.pipe.name}</strong><span>{row.pipe.lengthFrames} frames</span><span class:gen-conflict={row.conflicts.length}>{row.conflicts.length ? row.conflicts[0].message : 'Ready'}</span></div>
        {/each}
        <label>{APP_CONSTANTS.strings.sessionFailurePolicy}
          <select bind:value={policy}><option value="stop">{APP_CONSTANTS.strings.sessionStopPolicy}</option><option value="continue">{APP_CONSTANTS.strings.sessionContinuePolicy}</option></select>
        </label>
        <label><input type="checkbox" bind:checked={autoCompose} /> {APP_CONSTANTS.strings.sessionAutoCompose}</label>
      </div>
      <div class="modal-footer"><button class="btn-cancel" onclick={() => (open = false)}>{APP_CONSTANTS.strings.cancel}</button><button class="btn-confirm" disabled={!canStart} onclick={confirm}>{APP_CONSTANTS.strings.sessionGenerate}</button></div>
    </div>
  </div>
{/if}
