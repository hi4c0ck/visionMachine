feat: implement production screens with valid Svelte 5

- Convert all components to Svelte 5 syntax ($props, $state, $derived)
- Replace createEventDispatcher with callback props (onlogout, onthemeChange, etc.)
- Add FrameRuler and MultiThumbSlider components for composer pipes feature
- Implement keyframe system in ComposerPanel
- Add session management to ProfilePanel and ProjectsPanel
- Ensure proper accessibility (ARIA roles, keyboard handlers)
- Build passes without errors