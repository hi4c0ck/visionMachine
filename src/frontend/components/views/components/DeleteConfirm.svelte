<script>
  export let item = {};
  export let onConfirm = () => {};
  export let onCancel = () => {};
</script>

<div class="delete-confirm">
  <h4>Delete {item.name || 'item'}?</h4>
  <p>This action cannot be undone.</p>
  <div class="actions">
    <button class="btn btn-secondary" on:click={onCancel}>Cancel</button>
    <button class="btn btn-primary" style="background: var(--accent-error); border-color: var(--accent-error);" on:click={onConfirm}>Delete</button>
  </div>
</div>

<style>
  .delete-confirm {
    padding: var(--space-md);
  }
  
  .delete-confirm h4 {
    margin: 0 0 var(--space-sm);
    color: var(--accent-error);
  }
  
  .delete-confirm p {
    margin: 0 0 var(--space-lg);
    color: var(--text-secondary);
  }
  
  .actions {
    display: flex;
    gap: var(--space-sm);
    justify-content: flex-end;
  }
</style>
