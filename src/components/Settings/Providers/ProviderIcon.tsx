/**
 * OpenAgent-Desktop - Provider Icon
 *
 * If the provider has a logo from models.dev (icon starts with 'logo:'),
 * loads the SVG from the models.dev GitHub repo. Otherwise falls back to
 * a lucide-react icon.
 */

import React, { useState, useEffect } from 'react';
import {
  Sparkles, Brain, Gem, Cloud, Server, Boxes,
  Router, Wind, Network, Github,
  type LucideIcon,
} from 'lucide-react';

const FALLBACK_ICONS: Record<string, LucideIcon> = {
  openai: Sparkles,
  anthropic: Brain,
  google: Gem,
  'google-vertex': Server,
  'amazon-bedrock': Server,
  azure: Cloud,
  openrouter: Router,
  mistral: Wind,
  github: Github,
  gitlab: Boxes,
  cloud: Cloud,
  server: Server,
  sparkles: Sparkles,
  brain: Brain,
  gem: Gem,
  network: Network,
  zen: Sparkles,
};

export const ProviderIcon: React.FC<{ providerId?: string; icon?: string; size?: number; className?: string }> = ({
  providerId,
  icon,
  size = 20,
  className,
}) => {
  const [logoSvg, setLogoSvg] = useState<string | null>(null);

  // If the icon starts with 'logo:', it's a models.dev provider logo.
  // Fetch the SVG from the GitHub repo.
  useEffect(() => {
    if (!icon?.startsWith('logo:')) {
      setLogoSvg(null);
      return;
    }
    const pid = icon.slice(5);
    const url = `https://raw.githubusercontent.com/anomalyco/models.dev/dev/providers/${pid}/logo.svg`;
    fetch(url)
      .then(res => res.ok ? res.text() : null)
      .then(svg => setLogoSvg(svg))
      .catch(() => setLogoSvg(null));
  }, [icon]);

  // If we have a logo SVG, render it inline.
  if (logoSvg) {
    return (
      <div
        className={className}
        style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        dangerouslySetInnerHTML={{ __html: logoSvg }}
      />
    );
  }

  // Fall back to a lucide icon.
  const key = icon || providerId || 'cloud';
  const IconComp = FALLBACK_ICONS[key] || Cloud;
  return <IconComp size={size} className={className} />;
};

export default ProviderIcon;
