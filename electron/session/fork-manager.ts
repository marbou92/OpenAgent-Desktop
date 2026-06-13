/**
 * OpenAgent-Desktop - Session Fork Manager
 * 
 * Fork sessions at specific messages, share sessions, revert messages.
 * Like OpenCode: fork, share, revert operations.
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

export interface SessionFork {
  id: string;
  parentSessionId: string;
  forkedAtMessageIndex: number;
  title: string;
  createdAt: string;
}

export interface SessionRevert {
  id: string;
  sessionId: string;
  revertedAtMessageIndex: number;
  revertedMessages: any[];
  createdAt: string;
}

export interface SessionShare {
  id: string;
  sessionId: string;
  shareToken: string;
  expiresAt?: string;
  createdAt: string;
}

export class SessionForkManager extends EventEmitter {
  private forks: Map<string, SessionFork> = new Map();
  private reverts: Map<string, SessionRevert> = new Map();
  private shares: Map<string, SessionShare> = new Map();
  private configDir: string;

  constructor() {
    super();
    this.configDir = path.join(os.homedir(), '.openagent');
  }

  /**
   * Fork a session at a specific message index.
   * Returns the new (forked) session data up to that point.
   */
  fork(
    parentSessionId: string,
    messages: any[],
    atMessageIndex: number,
    title?: string
  ): { forkId: string; forkedMessages: any[] } {
    const forkId = `fork-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    const forkedMessages = messages.slice(0, atMessageIndex + 1);

    const fork: SessionFork = {
      id: forkId,
      parentSessionId,
      forkedAtMessageIndex: atMessageIndex,
      title: title || `Fork of ${parentSessionId}`,
      createdAt: new Date().toISOString(),
    };

    this.forks.set(forkId, fork);
    this.emit('session:forked', fork);

    return { forkId, forkedMessages };
  }

  /**
   * Revert a session to a specific message index.
   * Stores the reverted messages for potential unrevert.
   */
  revert(
    sessionId: string,
    messages: any[],
    atMessageIndex: number
  ): { revertId: string; remainingMessages: any[]; revertedMessages: any[] } {
    const revertId = `revert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    const remainingMessages = messages.slice(0, atMessageIndex + 1);
    const revertedMessages = messages.slice(atMessageIndex + 1);

    const revert: SessionRevert = {
      id: revertId,
      sessionId,
      revertedAtMessageIndex: atMessageIndex,
      revertedMessages,
      createdAt: new Date().toISOString(),
    };

    this.reverts.set(revertId, revert);
    this.emit('session:reverted', revert);

    return { revertId, remainingMessages, revertedMessages };
  }

  /**
   * Generate a shareable export of a session.
   */
  share(sessionId: string, messages: any[], expiresInDays?: number): { shareId: string; shareToken: string } {
    const shareId = `share-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const shareToken = crypto.randomBytes(16).toString('hex');

    const share: SessionShare = {
      id: shareId,
      sessionId,
      shareToken,
      expiresAt: expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined,
      createdAt: new Date().toISOString(),
    };

    this.shares.set(shareId, share);
    this.emit('session:shared', share);

    return { shareId, shareToken };
  }

  /**
   * Export a session as JSON.
   */
  exportSession(messages: any[], title: string): string {
    return JSON.stringify({
      title,
      exportedAt: new Date().toISOString(),
      version: '1.0',
      messageCount: messages.length,
      messages,
    }, null, 2);
  }

  getFork(forkId: string): SessionFork | undefined {
    return this.forks.get(forkId);
  }

  getForksByParent(parentSessionId: string): SessionFork[] {
    return Array.from(this.forks.values()).filter((f) => f.parentSessionId === parentSessionId);
  }
}
