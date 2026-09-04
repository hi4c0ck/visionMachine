import { mount } from 'svelte';
import App from './App.svelte';

console.log('[Boot] Starting VisionMachine app...');
const target = document.getElementById('app');
console.log('[Boot] Target element:', target);
if (target) {
  try {
    mount(App, { target });
    console.log('[Boot] App mounted successfully');
  } catch (e) {
    console.error('[Boot] Failed to mount app:', e);
    target.innerHTML = `<div style="color:red;padding:20px"><h1>Failed to load</h1><p>${e}</p></div>`;
  }
} else {
  console.error('[Boot] Target element #app not found!');
}