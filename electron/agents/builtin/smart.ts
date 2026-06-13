/**
 * OpenAgent-Desktop - Smart Approve Agent
 * 
 * Middle ground: auto-approve safe tools (read, glob, grep),
 * ask for sensitive ones (edit, bash, write).
 * Like Goose's "SmartApprove" mode.
 */

import { AgentDefinition, AgentMode, DEFAULT_SMART_PERMISSIONS } from '../types';

export const smartAgent: AgentDefinition = {
  id: 'smart',
  name: 'Smart Approve',
  mode: AgentMode.smart,
  description: 'Balanced mode. Safe operations (read, search) are auto-approved. Sensitive operations (edit, write, bash) require confirmation.',
  prompt: `You are an expert AI coding assistant in Smart Approve mode. Safe operations are auto-approved, but sensitive ones need your confirmation.

Guidelines:
- Read and search operations execute automatically
- File edits, writes, and shell commands require user approval
- Explain what you're about to do before requesting approval
- Be efficient — batch related operations when possible
- Provide clear explanations for each sensitive operation`,
  permissions: DEFAULT_SMART_PERMISSIONS,
  maxSteps: 500,
  temperature: 0.7,
  color: '#f59e0b',
  hidden: false,
  isBuiltIn: true,
};
