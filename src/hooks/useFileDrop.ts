/**
 * OpenAgent Desktop - useFileDrop Hook
 *
 * Listens for drag-and-drop events on the document,
 * tracks dropped files, and converts them for sending.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { AttachedFile } from '../types';

interface UseFileDropOptions {
  onFilesDropped?: (files: AttachedFile[]) => void;
  maxFileSize?: number; // in bytes, default 50MB
  maxFiles?: number; // default 10
}

interface UseFileDropReturn {
  isDragging: boolean;
  droppedFiles: AttachedFile[];
  removeFile: (index: number) => void;
  clearFiles: () => void;
  addFiles: (files: AttachedFile[]) => void;
  fileError: string | null;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILES = 10;

export function useFileDrop(options: UseFileDropOptions = {}): UseFileDropReturn {
  const {
    onFilesDropped,
    maxFileSize = MAX_FILE_SIZE,
    maxFiles = MAX_FILES,
  } = options;

  const [isDragging, setIsDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<AttachedFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer?.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    setFileError(null);

    if (!e.dataTransfer?.files) return;

    const newFiles: AttachedFile[] = [];
    let hasError = false;

    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i];

      // Check max files
      if (newFiles.length + droppedFiles.length >= maxFiles) {
        setFileError(`Maximum ${maxFiles} files allowed`);
        hasError = true;
        break;
      }

      // Check file size
      if (file.size > maxFileSize) {
        setFileError(`File "${file.name}" exceeds ${Math.round(maxFileSize / 1024 / 1024)}MB limit`);
        hasError = true;
        continue;
      }

      newFiles.push({
        name: file.name,
        path: (file as any).path || file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
      });
    }

    if (newFiles.length > 0) {
      setDroppedFiles(prev => [...prev, ...newFiles]);
      onFilesDropped?.(newFiles);
    }

    if (!hasError) {
      setFileError(null);
    }
  }, [droppedFiles, maxFiles, maxFileSize, onFilesDropped]);

  // Bind events to document
  useEffect(() => {
    document.addEventListener('dragenter', handleDragEnter as EventListener);
    document.addEventListener('dragleave', handleDragLeave as EventListener);
    document.addEventListener('dragover', handleDragOver as EventListener);
    document.addEventListener('drop', handleDrop as EventListener);

    return () => {
      document.removeEventListener('dragenter', handleDragEnter as EventListener);
      document.removeEventListener('dragleave', handleDragLeave as EventListener);
      document.removeEventListener('dragover', handleDragOver as EventListener);
      document.removeEventListener('drop', handleDrop as EventListener);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  const removeFile = useCallback((index: number) => {
    setDroppedFiles(prev => prev.filter((_, i) => i !== index));
    setFileError(null);
  }, []);

  const clearFiles = useCallback(() => {
    setDroppedFiles([]);
    setFileError(null);
  }, []);

  const addFiles = useCallback((files: AttachedFile[]) => {
    setDroppedFiles(prev => [...prev, ...files]);
    setFileError(null);
  }, []);

  return {
    isDragging,
    droppedFiles,
    removeFile,
    clearFiles,
    addFiles,
    fileError,
  };
}
