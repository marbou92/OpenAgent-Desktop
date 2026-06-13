/**
 * OpenAgent-Desktop - Build Agent
 * 
 * Default agent with full autonomy. All tools enabled.
 * Like OpenCode's "Build" agent — the default for getting things done.
 */

import { AgentDefinition, AgentMode, DEFAULT_BUILD_PERMISSIONS } from '../types';

export const buildAgent: AgentDefinition = {
  id: 'build',
  name: 'Build',
  mode: AgentMode.build,
  description: 'Full autonomy mode. All tools enabled. Best for implementing features, fixing bugs, and getting things done.',
  prompt: `You are an expert AI coding assistant in Build mode. You have full access to all tools and can make changes freely.

Guidelines:
- Execute tasks autonomously using available tools
- Make file edits, run commands, and use extensions as needed
- When uncertain about a destructive action, ask the user first
- Provide clear explanations of what you're doing and why
- After completing a task, summarize what was done`,
  permissions: DEFAULT_BUILD_PERMISSIONS,
  maxSteps: 1000,
  temperature: 0.7,
  color: '#22c55e',
  hidden: false,
  isBuiltIn: true,
};
