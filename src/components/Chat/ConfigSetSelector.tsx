/**
 * OpenAgent-Desktop - Config Set Selector
 * 
 * Dropdown to switch between named provider configurations.
 * Like OpenCowork's config set switching.
 */

import React, { useState, useRef, useEffect } from 'react';

export interface ConfigSetInfo {
  id: string;
  name: string;
  providerType: string;
  model: string;
  isDefault?: boolean;
}

interface ConfigSetSelectorProps {
  configSets: ConfigSetInfo[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

const ConfigSetSelector: React.FC<ConfigSetSelectorProps> = ({ configSets, activeId, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeSet = configSets.find((cs) => cs.id === activeId);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border transition-colors"
        style={{
          borderColor: 'var(--color-border-primary)',
          background: 'var(--color-bg-secondary)',
          color: 'var(--color-text-primary)',
        }}
      >
        <span className="truncate max-w-[120px]">{activeSet?.name || 'Default'}</span>
        <span style={{ color: 'var(--color-text-tertiary)' }}>▾</span>
      </button>

      {isOpen && (
        <div
          className="absolute top-full mt-1 right-0 z-50 w-56 rounded-[10px]"
          style={{
            background: 'var(--v2-background-bg-base, var(--color-bg-elevated))',
            boxShadow: 'var(--v2-elevation-floating, var(--shadow-popover))',
            padding: '4px',
          }}
        >
          {configSets.map((cs, idx) => {
            const isActive = cs.id === activeId;
            const isHovered = hoveredIdx === idx;
            return (
              <button
                key={cs.id}
                onClick={() => { onSelect(cs.id); setIsOpen(false); }}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded-[6px] transition-colors"
                style={{
                  background: isActive
                    ? 'var(--v2-overlay-simple-overlay-hover, var(--color-accent-soft))'
                    : isHovered
                    ? 'var(--v2-overlay-simple-overlay-hover, var(--color-bg-hover))'
                    : 'transparent',
                }}
              >
                <span
                  className="text-[13px] flex-1 truncate"
                  style={{
                    color: isActive ? 'var(--color-accent)' : 'var(--v2-text-text-base, var(--color-text-primary))',
                    fontFamily: 'var(--v2-font-family-text)',
                  }}
                >
                  {cs.name}
                </span>
                {isActive && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ConfigSetSelector;
