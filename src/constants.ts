const APP_VERSION = '0.3.1';

const APP_CONSTANTS = {
  strings: {
    appName: 'VisionMachine',
    version: APP_VERSION,
    welcomeTitle: 'Welcome to VisionMachine',
    enterName: 'Enter your name to continue',
    namePlaceholder: 'Your name...',
    getStarted: 'Get Started',
    logout: 'Logout',
    
    // Sidebar
    project: 'Projects',
    createProject: 'Create Project',
    sessions: 'Sessions',
    specifyPath: 'Specify Path',
    create: 'Create',
    cancel: 'Cancel',
    addSession: '+ Add Session',
    
    // Composer
    selectSession: 'Select a Session',
    selectSessionHint: 'Choose or create a session from the project panel to start editing',
    globalPrompt: 'GLOBAL',
    addGlobalPrompt: 'Click to add global prompt',
    pipe: 'Pipe',
    length: 'Length',
    frames: 'frames',
    addSegment: 'Add Segment',
    qLabel: 'Q',
    cLabel: 'C',
    
    // Tools
    preview: 'Preview',
    settings: 'Settings',
    generate: 'Generate',
    noPreview: 'No preview available',
    noPreviewHint: 'Generate your first video to see results here',
    selectToPreview: 'Select a session to preview',
    fps: 'FPS',
    resolution: 'Resolution',
    orientation: 'Orientation',
    quality: 'Quality (Q)',
    creativity: 'Creativity (C)',
    sessionsCount: 'Sessions',
    framesCount: 'Frames',
    generationsCount: 'Generations',
    
    // Modals
    addKeyframe: 'Add Keyframe Image',
    url: 'URL',
    textToImg: 'Text→Img',
    imgToImg: 'Img→Img',
    pasteImageUrl: 'Paste image URL...',
    describeImage: 'Describe the image...',
    referenceImage: 'Reference image URL...',
    editSegment: 'Edit Segment',
    addSegmentType: 'Add Segment',
    selectType: 'Select segment type to add:',
    editGlobalPrompt: 'Edit Global Prompt',
    globalPromptLabel: 'Global Prompt:',
    enterGlobalPrompt: 'Enter global prompt text...',
    createProjectModal: 'Create New Project',
    projectName: 'Project Name',
    projectNamePlaceholder: 'Enter project name...',
    customPath: 'Custom Path',
    customPathPlaceholder: 'C:\\Projects\\MyProject',
    createSessionModal: 'Create New Session',
    sessionName: 'Session Name',
    sessionNamePlaceholder: 'Enter session name...',
  },
  
  themes: [
    { id: 'jetbrains-dark', name: 'JetBrains Dark' },
    { id: 'steel-dark', name: 'Steel Machinery Dark' },
    { id: 'light', name: 'Light' },
  ],
  
  fpsPresets: [18, 24, 30, 48, 60],
  
  resolutions: ['480p', '720p', '1080p'],
  
  orientations: ['horizontal', 'vertical'],
  
  tagTypes: ['scene', 'camera', 'rotation', 'lighting', 'effect', 'zoom', 'transition'] as const,
};

export { APP_CONSTANTS, APP_VERSION };
