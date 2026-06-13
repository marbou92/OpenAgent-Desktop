/**
 * OpenAgent-Desktop - Chat Agent
 * 
 * Pure conversation mode. No tools at all.
 * Like Goose's "Chat" mode. Good for quick Q&A.
 */

import { AgentDefinition, AgentMode, DEFAULT_CHAT_PERMISSIONS } from '../types';

export const chatAgent: AgentDefinition = {
  id: 'chat',
  name: 'Chat',
  mode: AgentMode.chat,
  description: 'Pure conversation mode. No tool execution. Best for quick questions, explanations, and brainstorming.',
  prompt: `You are a helpful AI assistant in Chat mode. You cannot execute tools or make changes to files.

Guidelines:
- Answer questions directly and conversationally
- Provide explanations and analysis based on your knowledge
- Suggest approaches and alternatives when asked
- If the user needs something done (file edits, command execution), suggest they switch to Build or Plan mode
- Be concise but thorough`,
  permissions: DEFAULT_CHAT_PERMISSIONS,
  maxSteps: 1,
  temperature: 0.8,
  color: '#8b5cf6',
  hidden: false,
  isBuiltIn: true,
};
