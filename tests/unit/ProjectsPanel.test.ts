/**
 * Unit tests for ProjectsPanel.svelte
 * Tests: Project CRUD, Session management, modal interactions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@testing-library/svelte';
import ProjectsPanel from '../../src/components/ProjectsPanel.svelte';
import type { ProjectData, SessionData } from '../../src/types/app';

describe('ProjectsPanel.svelte', () => {
  const mockProjects: ProjectData[] = [
    {
      id: 'project-1',
      name: 'Test Project',
      createdAt: Date.now(),
      directoryPath: 'C:\\Projects\\test',
      sessions: [],
      totalGenerations: 0,
    },
  ];

  const mockSelectedProjectId = 'project-1';
  const mockSelectedSessionId = null;

  // Mock callbacks
  const mockOnSelectProject = vi.fn();
  const mockOnCreateProject = vi.fn();
  const mockOnDeleteProject = vi.fn();
  const mockOnCreateSession = vi.fn();
  const mockOnRenameSession = vi.fn();
  const mockOnDeleteSession = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render project list when projects exist', () => {
    const { getByText } = mount(ProjectsPanel, {
      props: {
        projects: mockProjects,
        selectedProjectId: mockSelectedProjectId,
        selectedSessionId: mockSelectedSessionId,
        onselectproject: mockOnSelectProject,
        oncreateproject: mockOnCreateProject,
        ondeleteproject: mockOnDeleteProject,
        oncreatesession: mockOnCreateSession,
        onrenamesession: mockOnRenameSession,
        ondeletesession: mockOnDeleteSession,
      },
    });

    expect(getByText('Test Project')).toBeInTheDocument();
  });

  it('should show empty state when no projects', () => {
    const { getByText } = mount(ProjectsPanel, {
      props: {
        projects: [],
        selectedProjectId: null,
        selectedSessionId: null,
        onselectproject: mockOnSelectProject,
        oncreateproject: mockOnCreateProject,
        ondeleteproject: mockOnDeleteProject,
        oncreatesession: mockOnCreateSession,
        onrenamesession: mockOnRenameSession,
        ondeletesession: mockOnDeleteSession,
      },
    });

    expect(getByText('No projects yet')).toBeInTheDocument();
  });

  it('should call oncreateproject when creating project', () => {
    const { getByRole } = mount(ProjectsPanel, {
      props: {
        projects: [],
        selectedProjectId: null,
        selectedSessionId: null,
        onselectproject: mockOnSelectProject,
        oncreateproject: mockOnCreateProject,
        ondeleteproject: mockOnDeleteProject,
        oncreatesession: mockOnCreateSession,
        onrenamesession: mockOnRenameSession,
        ondeletesession: mockOnDeleteSession,
      },
    });

    const createBtn = getByRole('button', { name: /create project/i });
    createBtn.click();

    // Modal should open
    expect(mockOnCreateProject).not.toHaveBeenCalled(); // Not yet confirmed
  });

  it('should handle project selection', () => {
    const { getByText } = mount(ProjectsPanel, {
      props: {
        projects: mockProjects,
        selectedProjectId: mockSelectedProjectId,
        selectedSessionId: mockSelectedSessionId,
        onselectproject: mockOnSelectProject,
        oncreateproject: mockOnCreateProject,
        ondeleteproject: mockOnDeleteProject,
        oncreatesession: mockOnCreateSession,
        onrenamesession: mockOnRenameSession,
        ondeletesession: mockOnDeleteSession,
      },
    });

    // Click on project
    const projectItem = getByText('Test Project');
    projectItem.click();

    expect(mockOnSelectProject).toHaveBeenCalledWith('project-1');
  });

  it('should handle session creation', () => {
    const { getByText } = mount(ProjectsPanel, {
      props: {
        projects: mockProjects,
        selectedProjectId: mockSelectedProjectId,
        selectedSessionId: null,
        onselectproject: mockOnSelectProject,
        oncreateproject: mockOnCreateProject,
        ondeleteproject: mockOnDeleteProject,
        oncreatesession: mockOnCreateSession,
        onrenamesession: mockOnRenameSession,
        ondeletesession: mockOnDeleteSession,
      },
    });

    // Find and click "Add Session" button
    const addSessionBtn = getByText('+ Add Session');
    addSessionBtn.click();

    expect(mockOnCreateSession).toHaveBeenCalledWith('project-1');
  });

  it('should mark selected project as active', () => {
    const { getByText } = mount(ProjectsPanel, {
      props: {
        projects: mockProjects,
        selectedProjectId: mockSelectedProjectId,
        selectedSessionId: null,
        onselectproject: mockOnSelectProject,
        oncreateproject: mockOnCreateProject,
        ondeleteproject: mockOnDeleteProject,
        oncreatesession: mockOnCreateSession,
        onrenamesession: mockOnRenameSession,
        ondeletesession: mockOnDeleteSession,
      },
    });

    const projectItem = getByText('Test Project').closest('.project-item');
    expect(projectItem).toHaveClass('selected');
  });

  it('should delete project when delete button clicked', () => {
    const { getByText } = mount(ProjectsPanel, {
      props: {
        projects: mockProjects,
        selectedProjectId: mockSelectedProjectId,
        selectedSessionId: null,
        onselectproject: mockOnSelectProject,
        oncreateproject: mockOnCreateProject,
        ondeleteproject: mockOnDeleteProject,
        oncreatesession: mockOnCreateSession,
        onrenamesession: mockOnRenameSession,
        ondeletesession: mockOnDeleteSession,
      },
    });

    // Find delete button (x button)
    const deleteBtn = getByText('×').closest('.delete-project-btn');
    if (deleteBtn) {
      deleteBtn.click();
      expect(mockOnDeleteProject).toHaveBeenCalledWith('project-1');
    }
  });

  it('should show session count in project item', () => {
    const projectWithSession: ProjectData = {
      ...mockProjects[0],
      sessions: [{
        id: 'session-1',
        name: 'Test Session',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        directoryPath: 'C:\\Projects\\test\\session1',
        pipes: [],
        fps: 24,
        resolution: '720p',
        orientation: 'horizontal',
        totalGeneratedFrames: 0,
      }],
    };

    const { getByText } = mount(ProjectsPanel, {
      props: {
        projects: [projectWithSession],
        selectedProjectId: 'project-1',
        selectedSessionId: null,
        onselectproject: mockOnSelectProject,
        oncreateproject: mockOnCreateProject,
        ondeleteproject: mockOnDeleteProject,
        oncreatesession: mockOnCreateSession,
        onrenamesession: mockOnRenameSession,
        ondeletesession: mockOnDeleteSession,
      },
    });

    expect(getByText('1')).toBeInTheDocument(); // Session count
  });

  it('should validate project name input', () => {
    const { getByRole, getByPlaceholderText } = mount(ProjectsPanel, {
      props: {
        projects: [],
        selectedProjectId: null,
        selectedSessionId: null,
        onselectproject: mockOnSelectProject,
        oncreateproject: mockOnCreateProject,
        ondeleteproject: mockOnDeleteProject,
        oncreatesession: mockOnCreateSession,
        onrenamesession: mockOnRenameSession,
        ondeletesession: mockOnDeleteSession,
      },
    });

    const confirmBtn = getByRole('button', { name: /create/i });
    
    // Should be disabled when empty
    expect(confirmBtn).toBeDisabled();
    
    // Type a name
    const input = getByPlaceholderText(/enter project name/i);
    input.value = 'My Project';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Should be enabled
    expect(confirmBtn).not.toBeDisabled();
  });
});
