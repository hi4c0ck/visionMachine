<script>
  export let type = '';
  export let data = {};
  export let onClose = () => {};
</script>

<div class="generic-modal">
  <h4>{type}</h4>
  <p>Modal content for {type}</p>
  <button class="btn btn-secondary" on:click={onClose}>Close</button>
</div>

<style>
  .generic-modal {
    padding: var(--space-md);
  }
  
  .generic-modal h4 {
    margin: 0 0 var(--space-sm);
  }
  
  .generic-modal p {
    margin: 0 0 var(--space-lg);
    color: var(--text-secondary);
  }
</style>
