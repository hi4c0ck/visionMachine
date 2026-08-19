// VisionMachine Frontend Application
// Tauri v2 + Vanilla JS

class VisionMachineApp {
    constructor() {
        this.state = {
            isGenerating: false,
            currentVideo: null,
            history: [],
            settings: {
                duration: 30,
                shots: 6,
                style: 'cinematic',
                resolution: '1920x1080'
            }
        };
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.loadSettings();
        this.updateUI();
        console.log('VisionMachine initialized');
    }
    
    bindEvents() {
        // Sliders
        const durationSlider = document.getElementById('duration-slider');
        const shotsSlider = document.getElementById('shots-slider');
        
        durationSlider.addEventListener('input', (e) => {
            this.state.settings.duration = parseInt(e.target.value);
            document.getElementById('duration-value').textContent = e.target.value;
            this.updateTimeline();
        });
        
        shotsSlider.addEventListener('input', (e) => {
            this.state.settings.shots = parseInt(e.target.value);
            document.getElementById('shots-value').textContent = e.target.value;
            this.updateTimeline();
        });
        
        // Selects
        document.getElementById('style-select').addEventListener('change', (e) => {
            this.state.settings.style = e.target.value;
        });
        
        document.getElementById('resolution-select').addEventListener('change', (e) => {
            this.state.settings.resolution = e.target.value;
        });
        
        // Buttons
        document.getElementById('btn-generate').addEventListener('click', () => {
            this.generateVideo();
        });
        
        document.getElementById('btn-play-pause').addEventListener('click', () => {
            this.togglePlayPause();
        });
        
        document.getElementById('btn-download').addEventListener('click', () => {
            this.downloadVideo();
        });
        
        document.getElementById('btn-retry').addEventListener('click', () => {
            this.retryGeneration();
        });
        
        document.getElementById('btn-clear-history').addEventListener('click', () => {
            this.clearHistory();
        });
        
        // Window controls (Tauri)
        if (window.__TAURI__) {
            const { getCurrentWindow } = window.__TAURI__.window;
            const window = getCurrentWindow();
            
            document.getElementById('btn-minimize')?.addEventListener('click', () => {
                window.minimize();
            });
            
            document.getElementById('btn-maximize')?.addEventListener('click', () => {
                window.toggleMaximize();
            });
            
            document.getElementById('btn-close')?.addEventListener('click', () => {
                window.close();
            });
        }
    }
    
    async generateVideo() {
        const prompt = document.getElementById('prompt-input').value.trim();
        
        if (!prompt) {
            this.showNotification('Please enter a prompt', 'error');
            return;
        }
        
        this.setState({ isGenerating: true });
        this.showProgress(true);
        this.updateGenerateButton();
        
        try {
            // Call Tauri command to generate video
            const result = await window.__TAURI__?.core?.invoke('generate_video', {
                prompt: prompt,
                duration: this.state.settings.duration,
                shots: this.state.settings.shots,
                style: this.state.settings.style,
                resolution: this.state.settings.resolution
            }) || { success: true, video_url: '#demo-video.mp4' };
            
            if (result.success) {
                this.setState({ currentVideo: result });
                this.addToHistory(prompt, result);
                this.showProgress(false);
                this.playVideo(result.video_url);
                this.showNotification('Video generated successfully!', 'success');
            } else {
                throw new Error(result.error || 'Generation failed');
            }
        } catch (error) {
            console.error('Generation error:', error);
            this.showNotification(`Error: ${error.message}`, 'error');
            this.showProgress(false);
        } finally {
            this.setState({ isGenerating: false });
            this.updateGenerateButton();
        }
    }
    
    playVideo(url) {
        const videoPlayer = document.getElementById('video-player');
        const placeholder = document.getElementById('video-placeholder');
        const overlay = document.getElementById('video-overlay');
        
        videoPlayer.src = url;
        videoPlayer.style.display = 'block';
        placeholder.style.display = 'none';
        overlay.style.display = 'flex';
        
        videoPlayer.play().catch(err => {
            console.log('Auto-play prevented:', err);
        });
    }
    
    togglePlayPause() {
        const video = document.getElementById('video-player');
        const btn = document.getElementById('btn-play-pause');
        
        if (video.paused) {
            video.play();
            btn.textContent = '⏸️';
        } else {
            video.pause();
            btn.textContent = '▶️';
        }
    }
    
    downloadVideo() {
        const video = document.getElementById('video-player');
        if (video.src) {
            const a = document.createElement('a');
            a.href = video.src;
            a.download = `visionmachine_${Date.now()}.mp4`;
            a.click();
        }
    }
    
    retryGeneration() {
        document.getElementById('btn-generate').click();
    }
    
    updateTimeline() {
        const container = document.getElementById('timeline-shots');
        const durationText = document.getElementById('timeline-duration');
        
        const shotDuration = Math.floor(this.state.settings.duration / this.state.settings.shots);
        durationText.textContent = `${this.state.settings.duration}s / ${shotDuration}s per shot`;
        
        container.innerHTML = '';
        
        for (let i = 0; i < this.state.settings.shots; i++) {
            const shot = document.createElement('div');
            shot.className = 'shot-thumbnail';
            shot.textContent = `Shot ${i + 1}`;
            shot.title = `${shotDuration}s duration`;
            container.appendChild(shot);
        }
    }
    
    addToHistory(prompt, result) {
        const item = {
            id: Date.now(),
            prompt: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
            duration: this.state.settings.duration,
            timestamp: new Date().toLocaleString(),
            videoUrl: result.video_url
        };
        
        this.state.history.unshift(item);
        if (this.state.history.length > 10) {
            this.state.history.pop();
        }
        
        this.renderHistory();
    }
    
    renderHistory() {
        const container = document.getElementById('history-list');
        
        if (this.state.history.length === 0) {
            container.innerHTML = '<p class="empty-state">No generations yet</p>';
            return;
        }
        
        container.innerHTML = this.state.history.map(item => `
            <div class="history-item" onclick="app.loadHistoryItem(${item.id})">
                <div class="history-item-title">${item.prompt}</div>
                <div class="history-item-meta">${item.duration}s • ${item.timestamp}</div>
            </div>
        `).join('');
    }
    
    loadHistoryItem(id) {
        const item = this.state.history.find(h => h.id === id);
        if (item && item.videoUrl) {
            this.playVideo(item.videoUrl);
        }
    }
    
    clearHistory() {
        this.state.history = [];
        this.renderHistory();
    }
    
    showProgress(show) {
        const section = document.getElementById('progress-section');
        const fill = document.getElementById('progress-fill');
        
        if (show) {
            section.style.display = 'block';
            fill.style.width = '0%';
            
            // Simulate progress
            let progress = 0;
            this.progressInterval = setInterval(() => {
                progress += Math.random() * 5;
                if (progress > 95) progress = 95;
                fill.style.width = progress + '%';
            }, 500);
        } else {
            section.style.display = 'none';
            clearInterval(this.progressInterval);
            document.getElementById('progress-fill').style.width = '0%';
        }
    }
    
    updateGenerateButton() {
        const btn = document.getElementById('btn-generate');
        btn.disabled = this.state.isGenerating;
        btn.textContent = this.state.isGenerating ? '⏳ Generating...' : '🎬 Generate Video';
    }
    
    setState(updates) {
        Object.assign(this.state, updates);
        this.updateUI();
    }
    
    updateUI() {
        this.updateGenerateButton();
        this.updateTimeline();
    }
    
    showNotification(message, type = 'info') {
        // Simple notification implementation
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'error' ? 'var(--accent-red)' : type === 'success' ? 'var(--accent-green)' : 'var(--accent-blue)'};
            color: white;
            border-radius: var(--radius-md);
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    loadSettings() {
        // Load from localStorage or defaults
        const saved = localStorage.getItem('vm_settings');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                this.state.settings = { ...this.state.settings, ...settings };
            } catch (e) {
                console.warn('Failed to load settings:', e);
            }
        }
    }
    
    saveSettings() {
        localStorage.setItem('vm_settings', JSON.stringify(this.state.settings));
    }
}

// Initialize app
const app = new VisionMachineApp();

// Expose to global scope for inline handlers
window.app = app;

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style);

console.log('✅ VisionMachine frontend loaded');
