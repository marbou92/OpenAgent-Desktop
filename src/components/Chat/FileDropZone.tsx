/**
 * OpenAgent-Desktop - File Drop Zone Component
 *
 * Overlay when files are dragged over the window.
 * Shows file list with sizes and type icons.
 */

import React from 'react';
import { useFileDrop } from '../../hooks/useFileDrop';

const FileDropZone: React.FC = () => {
  const { isDragging, droppedFiles: _droppedFiles } = useFileDrop();

  if (!isDragging) return null;

  return (
    <div className="file-drop-overlay">
      <div className="text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'var(--color-accent-soft)' }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <p className="text-lg font-semibold" style={{ color: 'var(--color-accent)' }}>
          Drop files here
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
          Files will be attached to your next message
        </p>
      </div>
    </div>
  );
};

export default FileDropZone;
