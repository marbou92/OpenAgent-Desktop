/**
 * OpenAgent-Desktop Aether - Shell Environment Probe
 * 
 * Probes the user's shell environment to pick up API keys
 * from .bashrc, .zshrc, .profile, etc.
 */

import { exec } from 'child_process';

const API_KEY_PATTERNS = [
  'API_KEY', 'API_BASE', 'API_URL', 'API_SECRET',
  'ANTHROPIC', 'OPENAI', 'GEMINI', 'GOOGLE_AI',
  'AZURE_OPENAI', 'AWS_', 'GCP_', 'VERTEX',
  'OPENROUTER', 'GROQ', 'MISTRAL', 'OLLAMA',
  'XAI', 'DEEPSEEK', 'CODESTRAL',
];

const ESSENTIAL_VARS = ['PATH', 'HOME', 'USER', 'LANG', 'TERM'];

export async function loadShellEnv(): Promise<Record<string, string>> {
  if (process.platform === 'win32') {
    return loadWindowsEnv();
  }
  return loadUnixEnv();
}

function loadWindowsEnv(): Record<string, string> {
  // On Windows, just use process.env — API keys are typically set via System Properties
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value && (isRelevantVar(key) || ESSENTIAL_VARS.includes(key))) {
      env[key] = value;
    }
  }
  return env;
}

async function loadUnixEnv(): Promise<Record<string, string>> {
  const shells = ['/bin/zsh', '/bin/bash', '/bin/sh'];
  const shell = shells.find(s => require('fs').existsSync(s)) || '/bin/sh';

  return new Promise((resolve) => {
    const command = `${shell} -ilc 'env -0'`;
    exec(command, { timeout: 10000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) {
        resolve(filterProcessEnv());
        return;
      }
      const env: Record<string, string> = {};
      const entries = stdout.split('\0');
      for (const entry of entries) {
        const eq = entry.indexOf('=');
        if (eq > 0) {
          const key = entry.slice(0, eq);
          const value = entry.slice(eq + 1);
          if (isRelevantVar(key) || ESSENTIAL_VARS.includes(key)) {
            env[key] = value;
          }
        }
      }
      resolve(env);
    });
  });
}

function filterProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value && (isRelevantVar(key) || ESSENTIAL_VARS.includes(key))) {
      env[key] = value;
    }
  }
  return env;
}

function isRelevantVar(key: string): boolean {
  const upper = key.toUpperCase();
  return API_KEY_PATTERNS.some(pattern => upper.includes(pattern));
}
