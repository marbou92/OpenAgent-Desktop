/**
 * OpenAgent-Desktop - Skill Watcher
 * 
 * Hot-reload for skills using chokidar file watcher.
 * Like OpenCowork: auto-reload SKILL.md when files change.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

export interface SkillFileChange {
  type: 'added' | 'changed' | 'removed';
  skillPath: string;
  skillName: string;
}

export class SkillWatcher extends EventEmitter {
  private watchedPaths: Set<string> = new Set();
  private pollIntervals: Map<string, NodeJS.Timeout> = new Map();
  private fileHashes: Map<string, number> = new Map();

  /**
   * Watch a directory for skill file changes.
   * Uses polling-based watching (compatible with all platforms).
   */
  watch(directory: string): void {
    if (this.watchedPaths.has(directory)) return;
    this.watchedPaths.add(directory);

    // Initial scan
    this.scanDirectory(directory);

    // Poll for changes every 2 seconds
    const interval = setInterval(() => {
      this.scanDirectory(directory);
    }, 2000);

    this.pollIntervals.set(directory, interval);
  }

  unwatch(directory: string): void {
    this.watchedPaths.delete(directory);
    const interval = this.pollIntervals.get(directory);
    if (interval) {
      clearInterval(interval);
      this.pollIntervals.delete(directory);
    }
  }

  private scanDirectory(directory: string): void {
    try {
      const entries = fs.readdirSync(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        if (entry.isDirectory()) {
          // Check for SKILL.md in subdirectory
          const skillMdPath = path.join(fullPath, 'SKILL.md');
          try {
            const stat = fs.statSync(skillMdPath);
            const currentHash = stat.mtimeMs;
            const previousHash = this.fileHashes.get(skillMdPath);
            
            if (previousHash === undefined) {
              this.fileHashes.set(skillMdPath, currentHash);
              this.emit('skill:added', {
                type: 'added',
                skillPath: fullPath,
                skillName: entry.name,
              } as SkillFileChange);
            } else if (currentHash !== previousHash) {
              this.fileHashes.set(skillMdPath, currentHash);
              this.emit('skill:changed', {
                type: 'changed',
                skillPath: fullPath,
                skillName: entry.name,
              } as SkillFileChange);
            }
          } catch {
            // No SKILL.md in this directory, might have been removed
            const previousHash = this.fileHashes.get(path.join(fullPath, 'SKILL.md'));
            if (previousHash !== undefined) {
              this.fileHashes.delete(path.join(fullPath, 'SKILL.md'));
              this.emit('skill:removed', {
                type: 'removed',
                skillPath: fullPath,
                skillName: entry.name,
              } as SkillFileChange);
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist or is unreadable
    }
  }

  stopAll(): void {
    for (const interval of this.pollIntervals.values()) {
      clearInterval(interval);
    }
    this.pollIntervals.clear();
    this.watchedPaths.clear();
    this.fileHashes.clear();
  }
}
