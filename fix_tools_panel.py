#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fix T6: Add compiler panel to ToolsPanel.svelte"""

filepath = 'src/components/ToolsPanel.svelte'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Add import for compilePrompt
import_line = "import { APP_CONSTANTS } from '$constants';"
new_import = """import { APP_CONSTANTS } from '$constants';
	import { compilePrompt } from '$lib/compiler';"""

if "compilePrompt" not in content:
    content = content.replace(import_line, new_import)
    print("[OK] Added compiler import")
else:
    print("[INFO] Compiler import already present")

# Add compiled output derived state after stats
stats_section = """const stats = $derived(getStats());"""
new_stats_section = """const stats = $derived(getStats());

	// T6: Compiled prompt output (T6)
	const compiledOutput = $derived.by(() => {
		if (!session?.pipes?.length) return '';
		// Use first pipe for compilation preview
		return compilePrompt(session.pipes[0]);
	});"""

if "$derived.by(() => {" not in content or "compiledOutput" not in content:
    content = content.replace(stats_section, new_stats_section)
    print("[OK] Added compiledOutput derived state")
else:
    print("[INFO] compiledOutput already present")

# Add compiled panel before closing divs - after stats section
# Find where to insert - after the stats section closing div
insert_after = """  <!-- Stats -->
  <div class="stats-section">
    <div class="section-header">
      <span class="section-title">{APP_CONSTANTS.strings.stats}</span>
    </div>
    
    <div class="stats-content">
      <div class="stat-item">
        <span class="stat-value">{stats.sessions}</span>
        <span class="stat-label">Sessions</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{stats.pipes}</span>
        <span class="stat-label">Pipes</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{stats.frames}</span>
        <span class="stat-label">Frames</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{stats.generations}</span>
        <span class="stat-label">Generations</span>
      </div>
    </div>
  </div>"""

new_insert = """  <!-- Stats -->
  <div class="stats-section">
    <div class="section-header">
      <span class="section-title">{APP_CONSTANTS.strings.stats}</span>
    </div>
    
    <div class="stats-content">
      <div class="stat-item">
        <span class="stat-value">{stats.sessions}</span>
        <span class="stat-label">Sessions</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{stats.pipes}</span>
        <span class="stat-label">Pipes</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{stats.frames}</span>
        <span class="stat-label">Frames</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{stats.generations}</span>
        <span class="stat-label">Generations</span>
      </div>
    </div>
  </div>

  <!-- T6: Compiled Prompt Panel -->
  <div class="compiled-section">
    <div class="section-header">
      <span class="section-title">Compiled Prompt</span>
    </div>
    {#if session}
      <details class="compiled-panel">
        <summary>View Compiled Output</summary>
        <pre class="compiled-output">{compiledOutput || 'No pipe selected'}</pre>
        {#if compiledOutput}
          <button class="btn-copy" onclick={() => navigator.clipboard.writeText(compiledOutput)}>Copy</button>
        {/if}
      </details>
    {:else}
      <div class="no-session-hint">Select a session to view compiled prompt</div>
    {/if}
  </div>"""

if "compiledOutput" not in content.split("<!-- T6")[0]:
    content = content.replace(insert_after, new_insert)
    print("[OK] Added compiled prompt panel HTML")
else:
    print("[INFO] Compiled panel already present")

# Add CSS for compiled panel
css_section = """.btn-confirm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }"""

new_css = """  .btn-confirm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* T6: Compiled Panel */
  .compiled-section {
    border-bottom: 1px solid var(--border-color, #3A3A3F);
  }

  .compiled-panel {
    padding: 12px;
  }

  .compiled-panel summary {
    font-size: 12px;
    color: var(--text-muted, #808080);
    cursor: pointer;
    margin-bottom: 8px;
  }

  .compiled-output {
    font-family: monospace;
    font-size: 11px;
    background: var(--bg-primary, #1A1A1D);
    padding: 10px;
    border-radius: 4px;
    overflow-x: auto;
    white-space: pre-wrap;
    color: var(--text-primary, #EEEEEE);
    max-height: 200px;
    overflow-y: auto;
    margin-bottom: 8px;
  }

  .btn-copy {
    width: 100%;
    padding: 6px 12px;
    background: var(--bg-input, #3c3c3c);
    color: var(--text-muted, #808080);
    border: 1px solid var(--border-color, #555);
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.15s;
  }

  .btn-copy:hover {
    background: var(--bg-hover, #454545);
    color: var(--text-primary, #fff);
  }"""

if ".compiled-section" not in content:
    content = content.replace(css_section, new_css)
    print("[OK] Added compiled panel CSS")
else:
    print("[INFO] CSS already present")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("[DONE] ToolsPanel.svelte updated with T6 compiler panel")
