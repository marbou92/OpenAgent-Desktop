/**
 * OpenAgent-Desktop - Provider Icon
 *
 * Maps a provider id (or icon name) to a lucide-react icon component.
 * Falls back to a generic "cloud" icon.
 */

import React from 'react';
import {
  Sparkles, Brain, Gem, Cloud, Server, Boxes,
  Router, Wind, Search, Zap, Anchor, Network,
  type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  // builtin
  openai: Sparkles,
  anthropic: Brain,
  gemini: Gem,
  'azure-openai': Cloud,
  bedrock: Server,
  vertex: Server,
  // routers / aggregators
  openrouter: Router,
  mistral: Wind,
  cohere: Search,
  groq: Zap,
  deepseek: Anchor,
  together: Boxes,
  // generic
  cloud: Cloud,
  server: Server,
  sparkles: Sparkles,
  brain: Brain,
  gem: Gem,
  network: Network,
};

export const ProviderIcon: React.FC<{ providerId?: string; icon?: string; size?: number; className?: string }> = ({
  providerId,
  icon,
  size = 20,
  className,
}) => {
  const key = icon || providerId || 'cloud';
  const IconComp = ICON_MAP[key] || Cloud;
  return <IconComp size={size} className={className} />;
};

export default ProviderIcon;
