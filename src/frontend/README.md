# VisionMachine Frontend

Modern dark-themed UI for AI video generation.

## Features

- **Prompt Input**: Rich textarea for video descriptions
- **Duration Slider**: 3-60 seconds with real-time preview
- **Shot Count**: 4-12 shots for multi-shot chaining
- **Style Selector**: Cinematic, Anime, Realistic, Artistic, Cartoon
- **Resolution Picker**: 480p, 720p, 1080p
- **Video Player**: HTML5 video with controls
- **Timeline View**: Visual shot sequence display
- **History Panel**: Last 20 generations
- **Progress Tracking**: Real-time generation progress
- **Toast Notifications**: Success/error messages
- **Keyboard Shortcuts**: Ctrl+Enter to generate

## Tech Stack

- Vanilla JavaScript (no framework dependencies)
- CSS3 with custom properties
- Tauri IPC for backend communication

## File Structure

```
src/frontend/
├── index.html      # Main HTML structure
├── css/
│   └── app.css     # Complete styling (~700 lines)
└── js/
    └── app.js      # Application logic
```

## Styling Highlights

- Dark theme optimized for creative work
- Responsive grid layout (3-column)
- Smooth animations and transitions
- Custom slider styling
- Toast notification system
- Progress bar with shimmer effect
- Timeline thumbnail grid

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Development

No build step required! Just open `index.html` in browser or run with Tauri:

```powershell
cargo tauri dev
```

## Integration with Tauri

Replace mock functions with real Tauri commands:

```javascript
// In app.js, replace simulateGeneration() with:
async function generateVideo() {
    const { invoke } = window.__TAURI__.core;
    
    const result = await invoke('generate_video', {
        prompt: this.state.settings.prompt,
        duration: this.state.settings.duration,
        shots: this.state.settings.shots,
        style: this.state.settings.style,
        resolution: this.state.settings.resolution
    });
    
    // Handle result...
}
```

## Accessibility

- Keyboard navigable
- Screen reader friendly
- Focus indicators
- ARIA labels on interactive elements

---

*Created: 2026-08-19*