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
          className="absolute top-full mt-1 right-0 z-50 w-56 rounded-lg border shadow-lg py-1"
          style={{ background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-primary)' }}
        >
          {configSets.map((cs) => (
            <button
              key={cs.id}
              onClick={() => { onSelect(cs.id); setIsOpen(false); }}
              className="w-full px-3 py-2 text-left hover:bg-[var(--color-bg-tertiary)] transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{cs.name}</span>
                {cs.isDefault && (
                  <span className="text-[10px] px-1 rounded" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>default</span>
                )}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                {cs.providerType} / {cs.model}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ConfigSetSelector;
