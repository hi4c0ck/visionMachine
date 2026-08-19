// VisionMachine Frontend Application
// Modern dark-themed UI with Tauri integration

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
            },
            progress: {
                percent: 0,
                status: '',
                detail: ''
            }
        };
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.loadFromStorage();
        this.updateUI();
        this.checkProviderStatus();
        console.log('✅ VisionMachine initialized');
    }
    
    bindEvents() {
        // Sliders
        const durationSlider = document.getElementById('duration-slider');
        const shotsSlider = document.getElementById('shots-slider');
        
        durationSlider.addEventListener('input', (e) => {
            this.state.settings.duration = parseInt(e.target.value);
            document.getElementById('duration-value').textContent = e.target.value;
            this.updateTimeline();
            this.saveToStorage();
        });
        
        shotsSlider.addEventListener('input', (e) => {
            this.state.settings.shots = parseInt(e.target.value);
            document.getElementById('shots-value').textContent = e.target.value;
            this.updateTimeline();
            this.saveToStorage();
        });
        
        // Selects
        document.getElementById('style-select').addEventListener('change', (e) => {
            this.state.settings.style = e.target.value;
            this.saveToStorage();
        });
        
        document.getElementById('resolution-select').addEventListener('change', (e) => {
            this.state.settings.resolution = e.target.value;
            this.saveToStorage();
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
        
        document.getElementById('btn-settings').addEventListener('click', () => {
            this.showToast('Settings coming soon', 'info');
        });
        
        document.getElementById('btn-help').addEventListener('click', () => {
            this.showToast('Help documentation coming soon', 'info');
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.generateVideo();
                }
            }
        });
    }
    
    async generateVideo() {
        const prompt = document.getElementById('prompt-input').value.trim();
        
        if (!prompt) {
            this.showToast('Please enter a prompt', 'error');
            document.getElementById('prompt-input').focus();
            return;
        }
        
        if (this.state.isGenerating) {
            this.showToast('Already generating, please wait...', 'warning');
            return;
        }
        
        this.setState({ isGenerating: true });
        this.showProgress(true);
        this.updateGenerateButton();
        this.setStatus('Generating video...');
        
        try {
            // Simulate generation (replace with actual Tauri command)
            await this.simulateGeneration(prompt);
            
            // In production, use:
            // const result = await invoke('generate_video', {
            //     prompt: prompt,
            //     duration: this.state.settings.duration,
            //     shots: this.state.settings.shots,
            //     style: this.state.settings.style,
            //     resolution: this.state.settings.resolution
            // });
            
            const mockResult = {
                success: true,
                video_url: '#', // Would be actual URL
                metadata: {
                    prompt: prompt,
                    duration: this.state.settings.duration,
                    shots: this.state.settings.shots,
                    style: this.state.settings.style,
                    resolution: this.state.settings.resolution,
                    generated_at: new Date().toISOString()
                }
            };
            
            if (mockResult.success) {
                this.setState({ currentVideo: mockResult });
                this.addToHistory(prompt, mockResult);
                this.showProgress(false);
                this.playVideo(mockResult.video_url);
                this.showToast('Video generated successfully!', 'success');
                this.setStatus('Ready');
            } else {
                throw new Error(mockResult.error || 'Generation failed');
            }
        } catch (error) {
            console.error('Generation error:', error);
            this.showToast(`Error: ${error.message}`, 'error');
            this.showProgress(false);
            this.setStatus('Error occurred');
        } finally {
            this.setState({ isGenerating: false });
            this.updateGenerateButton();
        }
    }
    
    async simulateGeneration(prompt) {
        // Simulate generation progress
        const steps = [
            { percent: 10, status: 'Analyzing prompt...', detail: 'Breaking into shots' },
            { percent: 25, status: 'Generating shots...', detail: 'Shot 1/6' },
            { percent: 40, status: 'Generating shots...', detail: 'Shot 2/6' },
            { percent: 55, status: 'Generating shots...', detail: 'Shot 3/6' },
            { percent: 70, status: 'Generating shots...', detail: 'Shot 4/6' },
            { percent: 85, status: 'Generating shots...', detail: 'Shot 5/6' },
            { percent: 95, status: 'Finalizing...', detail: 'Combining clips' },
        ];
        
        for (const step of steps) {
            await this.delay(800);
            this.updateProgress(step.percent, step.status, step.detail);
        }
        
        await this.delay(500);
        this.updateProgress(100, 'Complete', 'Video ready!');
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
        if (video.src && video.src !== window.location.href) {
            const a = document.createElement('a');
            a.href = video.src;
            a.download = `visionmachine_${Date.now()}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            this.showToast('Download started', 'success');
        }
    }
    
    retryGeneration() {
        document.getElementById('btn-generate').click();
    }
    
    updateTimeline() {
        const container = document.getElementById('timeline-shots');
        const durationText = document.getElementById('timeline-duration');
        const shotCount = this.state.settings.shots;
        const totalDuration = this.state.settings.duration;
        const shotDuration = Math.floor(totalDuration / shotCount);
        
        durationText.textContent = `${totalDuration}s / ${shotDuration}s per shot`;
        
        container.innerHTML = '';
        
        for (let i = 0; i < shotCount; i++) {
            const shot = document.createElement('div');
            shot.className = 'shot-thumbnail';
            shot.innerHTML = `
                <span class="shot-number">${i + 1}</span>
                <span class="shot-duration">${shotDuration}s</span>
            `;
            shot.title = `Shot ${i + 1}: ${shotDuration} seconds`;
            container.appendChild(shot);
        }
    }
    
    addToHistory(prompt, result) {
        const item = {
            id: Date.now(),
            prompt: prompt,
            duration: result.metadata?.duration || this.state.settings.duration,
            timestamp: result.metadata?.generated_at || new Date().toISOString(),
            videoUrl: result.video_url
        };
        
        this.state.history.unshift(item);
        if (this.state.history.length > 20) {
            this.state.history.pop();
        }
        
        this.renderHistory();
        this.saveToStorage();
    }
    
    renderHistory() {
        const container = document.getElementById('history-list');
        
        if (this.state.history.length === 0) {
            container.innerHTML = '<p class="empty-state">No generations yet</p>';
            return;
        }
        
        container.innerHTML = this.state.history.map(item => `
            <div class="history-item" onclick="app.loadHistoryItem(${item.id})">
                <div class="history-item-title">${this.escapeHtml(item.prompt)}</div>
                <div class="history-item-meta">
                    <span>${item.duration}s</span>
                    <span>•</span>
                    <span>${new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
            </div>
        `).join('');
    }
    
    loadHistoryItem(id) {
        const item = this.state.history.find(h => h.id === id);
        if (item && item.videoUrl) {
            this.playVideo(item.videoUrl);
            this.showToast('Loaded from history', 'info');
        }
    }
    
    clearHistory() {
        if (confirm('Clear all history?')) {
            this.state.history = [];
            this.renderHistory();
            this.saveToStorage();
            this.showToast('History cleared', 'success');
        }
    }
    
    showProgress(show) {
        const section = document.getElementById('progress-section');
        section.style.display = show ? 'block' : 'none';
    }
    
    updateProgress(percent, status, detail) {
        this.state.progress = { percent, status, detail };
        
        document.getElementById('progress-fill').style.width = `${percent}%`;
        document.getElementById('progress-status').textContent = status;
        document.getElementById('progress-percent').textContent = `${percent}%`;
        document.getElementById('progress-detail').textContent = detail;
    }
    
    updateGenerateButton() {
        const btn = document.getElementById('btn-generate');
        btn.disabled = this.state.isGenerating;
        btn.innerHTML = this.state.isGenerating 
            ? '<span class="spinner"></span><span>Generating...</span>'
            : '<span class="btn-icon">🎬</span><span>Generate Video</span>';
    }
    
    setStatus(text) {
        document.getElementById('status-text').textContent = text;
    }
    
    async checkProviderStatus() {
        const statusEl = document.getElementById('provider-status');
        const providerInfo = document.getElementById('provider-info');
        
        try {
            // In production, call Tauri command
            // const isConnected = await invoke('validate_provider', { provider_name: 'agnes' });
            const isConnected = true; // Mock
            
            if (isConnected) {
                statusEl.innerHTML = '<span class="status-dot connected"></span><span>Agnes (connected)</span>';
                providerInfo.textContent = 'Provider: Agnes | API: v1 | ✓ Connected';
            } else {
                statusEl.innerHTML = '<span class="status-dot disconnected"></span><span>Disconnected</span>';
                providerInfo.textContent = 'Provider: Agnes | API: v1 | ✗ Error';
            }
        } catch (error) {
            statusEl.innerHTML = '<span class="status-dot connecting"></span><span>Checking...</span>';
            providerInfo.textContent = 'Provider: Agnes | API: v1 | ⚠ Checking...';
        }
    }
    
    setState(updates) {
        Object.assign(this.state, updates);
        this.updateUI();
    }
    
    updateUI() {
        this.updateGenerateButton();
        this.updateTimeline();
    }
    
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        
        toast.innerHTML = `
            <span>${icons[type] || 'ℹ️'}</span>
            <span class="toast-message">${this.escapeHtml(message)}</span>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    saveToStorage() {
        try {
            localStorage.setItem('vm_settings', JSON.stringify(this.state.settings));
            localStorage.setItem('vm_history', JSON.stringify(this.state.history));
        } catch (e) {
            console.warn('Failed to save to localStorage:', e);
        }
    }
    
    loadFromStorage() {
        try {
            const settings = localStorage.getItem('vm_settings');
            const history = localStorage.getItem('vm_history');
            
            if (settings) {
                this.state.settings = { ...this.state.settings, ...JSON.parse(settings) };
            }
            
            if (history) {
                this.state.history = JSON.parse(history);
                this.renderHistory();
            }
            
            // Update UI with loaded settings
            document.getElementById('duration-slider').value = this.state.settings.duration;
            document.getElementById('duration-value').textContent = this.state.settings.duration;
            document.getElementById('shots-slider').value = this.state.settings.shots;
            document.getElementById('shots-value').textContent = this.state.settings.shots;
            document.getElementById('style-select').value = this.state.settings.style;
            document.getElementById('resolution-select').value = this.state.settings.resolution;
            
        } catch (e) {
            console.warn('Failed to load from localStorage:', e);
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VisionMachineApp();
});

// Expose for inline handlers
window.VisionMachineApp = VisionMachineApp;
