/**
 * OpenAgent-Desktop - Projects View
 *
 * Manage project workspaces that group sessions, extensions,
 * skills, and provider configurations together.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Toast, ExtensionInfo } from '../../types';

const api = (window as any).openagent;

interface ProjectConfig {
  id: string;
  name: string;
  description?: string;
  directory: string;
  providerId?: string;
  model?: string;
  extensions: string[];
  skills: string[];
  createdAt: string;
  updatedAt: string;
}

interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  defaultExtensions: string[];
  defaultSkills: string[];
  providerType?: string;
}

interface ProjectsViewProps {
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

const ProjectsView: React.FC<ProjectsViewProps> = ({ addToast }) => {
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectConfig | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state for new project
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    templateId: '',
  });

  const fetchProjects = useCallback(async () => {
    try {
      if (api?.projects?.list) {
        const list = await api.projects.list();
        setProjects(list);
      }
      if (api?.projects?.templates) {
        const tpls = await api.projects.templates();
        setTemplates(tpls);
      }
      if (api?.projects?.getActive) {
        const active = await api.projects.getActive();
        setActiveProject(active);
      }
    } catch {
      // Projects not available yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async () => {
    if (!newProject.name.trim()) {
      addToast({ type: 'error', title: 'Project name is required' });
      return;
    }

    try {
      const template = templates.find((t) => t.id === newProject.templateId);
      await api.projects.create({
        name: newProject.name,
        description: newProject.description || undefined,
        extensions: template?.defaultExtensions || [],
        skills: template?.defaultSkills || [],
        providerId: template?.providerType || undefined,
      });
      addToast({ type: 'success', title: 'Project created' });
      setShowCreateDialog(false);
      setNewProject({ name: '', description: '', templateId: '' });
      await fetchProjects();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to create project', message: err.message });
    }
  };

  const handleOpen = async (projectId: string) => {
    try {
      await api.projects.setActive(projectId);
      addToast({ type: 'success', title: 'Project activated' });
      await fetchProjects();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to activate project', message: err.message });
    }
  };

  const handleDelete = async (projectId: string) => {
    try {
      await api.projects.delete(projectId);
      addToast({ type: 'success', title: 'Project deleted' });
      await fetchProjects();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to delete project', message: err.message });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Loading projects...</div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>Projects</h2>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--color-accent)', color: 'white' }}
        >
          + New Project
        </button>
      </div>

      {/* Active Project */}
      {activeProject && (
        <div className="p-3 rounded-lg border" style={{ background: 'var(--color-accent-soft)', borderColor: 'var(--color-accent)' }}>
          <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-accent)' }}>Active Project</div>
          <div className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{activeProject.name}</div>
          {activeProject.description && (
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{activeProject.description}</div>
          )}
          <div className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
            {activeProject.extensions.length} extensions | {activeProject.skills.length} skills
          </div>
        </div>
      )}

      {/* Project Grid */}
      <div className="grid grid-cols-2 gap-3">
        {projects.map((project) => (
          <div
            key={project.id}
            className="p-3 rounded-lg border cursor-pointer transition-colors"
            style={{
              borderColor: activeProject?.id === project.id ? 'var(--color-accent)' : 'var(--color-border-primary)',
              background: activeProject?.id === project.id ? 'var(--color-accent-soft)' : 'var(--color-bg-secondary)',
            }}
            onClick={() => handleOpen(project.id)}
          >
            <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{project.name}</div>
            {project.description && (
              <div className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>{project.description}</div>
            )}
            <div className="flex items-center justify-between mt-2">
              <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {new Date(project.updatedAt).toLocaleDateString()}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(project.id); }}
                className="text-xs px-2 py-0.5 rounded transition-colors"
                style={{ color: '#ef4444' }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {projects.length === 0 && (
        <div className="text-center py-8">
          <div className="text-4xl mb-2">📁</div>
          <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>No projects yet</div>
          <div className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>Create a project to organize your work</div>
        </div>
      )}

      {/* Templates */}
      {templates.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--color-text-primary)' }}>Quick Start Templates</h3>
          <div className="grid grid-cols-2 gap-2">
            {templates.map((template) => (
              <div
                key={template.id}
                className="p-2 rounded-lg border cursor-pointer transition-colors"
                style={{ borderColor: 'var(--color-border-primary)', background: 'var(--color-bg-tertiary)' }}
                onClick={() => {
                  setNewProject((prev) => ({ ...prev, templateId: template.id, name: prev.name || template.name }));
                  setShowCreateDialog(true);
                }}
              >
                <div className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{template.name}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{template.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-xl border shadow-2xl w-full max-w-md" style={{ background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-primary)' }}>
            <div className="p-4 border-b" style={{ borderColor: 'var(--color-border-secondary)' }}>
              <h3 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>New Project</h3>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block" style={{ color: 'var(--color-text-primary)' }}>Name</label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="My Project"
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block" style={{ color: 'var(--color-text-primary)' }}>Description</label>
                <input
                  type="text"
                  value={newProject.description}
                  onChange={(e) => setNewProject((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                />
              </div>
              {templates.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-1 block" style={{ color: 'var(--color-text-primary)' }}>Template</label>
                  <select
                    value={newProject.templateId}
                    onChange={(e) => setNewProject((prev) => ({ ...prev, templateId: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border text-sm"
                    style={{ background: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border-primary)', color: 'var(--color-text-primary)' }}
                  >
                    <option value="">None</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t" style={{ borderColor: 'var(--color-border-secondary)' }}>
              <button
                onClick={() => setShowCreateDialog(false)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--color-accent)', color: 'white' }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsView;
