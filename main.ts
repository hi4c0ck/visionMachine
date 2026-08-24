import App from './App.svelte';

const container = document.getElementById('app');
if (!container) throw new Error('Failed to find #app element');

const app = new App({
  target: container,
});

export default app;
