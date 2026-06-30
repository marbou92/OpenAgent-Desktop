/**
 * OpenAgent-Desktop — DirectoryBadge (Phase 2.4.3)
 *
 * A small rounded rectangle badge shown at the top of the chat area,
 * displaying the current working directory. Matches Claude Code desktop's
 * directory indicator.
 *
 *   ┌──────────────────────────┐
 *   │ 📁 pasqualepillitteri.it │
 *   └──────────────────────────┘
 *
 * Clicking it opens the ProjectSelector dropdown to switch projects.
 */

import React, { useState, useEffect, useCallback } from 'react';
import ProjectSelector from './ProjectSelector';

const api = (window as any).openagent;

interface DirectoryBadgeProps {
  /** The working directory to display. If not provided, reads from the active project. */
  workingDirectory?: string;
}

function getFolderName(directory: string): string {
  if (!directory) return 'No project';
  const parts = directory.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || directory;
}

const DirectoryBadge: React.FC<DirectoryBadgeProps> = ({ workingDirectory }) => {
  const [dir, setDir] = useState<string>(workingDirectory || '');

  // If no workingDirectory prop, read from the active project
  useEffect(() => {
    if (workingDirectory) {
      setDir(workingDirectory);
      return;
    }
    if (!api?.projects?.getActive) return;
    api.projects.getActive().then((project: any) => {
      if (project?.directory) setDir(project.directory);
    }).catch(() => {});
  }, [workingDirectory]);

  // Listen for project changes
  useEffect(() => {
    if (!api?.on?.projectActivated) return;
    const unsub = api.on.projectActivated((project: any) => {
      if (project?.directory) setDir(project.directory);
    });
    return () => unsub?.();
  }, []);

  const folderName = getFolderName(dir);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0">
      {/* Phase 2.4.3: Directory badge — clickable to open ProjectSelector */}
      <ProjectSelector />
      {/* Show the full path as a tooltip */}
      <span
        className="text-[11px] truncate max-w-[300px]"
        style={{
          color: 'var(--v2-text-text-faint, var(--color-text-muted))',
          fontFamily: 'var(--v2-font-family-text, inherit)',
        }}
        title={dir || 'No working directory selected'}
      >
        {dir ? `Working in: ${dir}` : 'No working directory'}
      </span>
    </div>
  );
};

export default DirectoryBadge;
