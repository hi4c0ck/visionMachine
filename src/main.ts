import { mount } from 'svelte';
import App from './App.svelte';
// Global background/idle gate: pauses all CSS animations + display <video>
// when the window is unfocused/hidden (App.svelte toggles html.vm-bg-idle).
import './bg-idle.css';

if (import.meta.env.DEV) console.log('[Boot] Starting VisionMachine app...');
const target = document.getElementById('app');
if (import.meta.env.DEV) console.log('[Boot] Target element:', target);
if (target) {
  try {
    mount(App, { target });
    if (import.meta.env.DEV) console.log('[Boot] App mounted successfully');
  } catch (e) {
    console.error('[Boot] Failed to mount app:', e);
    target.innerHTML = `<div style="color:red;padding:20px"><h1>Failed to load</h1><p>${e}</p></div>`;
  }
} else {
  console.error('[Boot] Target element #app not found!');
}