/**
 * OpenAgent-Desktop Aether - Skills Panel
 * 
 * Displays available skills (built-in + custom) and allows execution.
 */

import React, { useState, useEffect } from 'react';

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: Array<{ name: string; description: string; required: boolean; type: string }>;
}

export const SkillsPanel: React.FC = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState<string | null>('document');

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    try {
      const result = await (window as any).openagent?.skills?.list();
      if (Array.isArray(result)) {
        setSkills(result);
      }
    } catch {
      setSkills([]);
    }
    setLoading(false);
  };

  const categories = Array.from(new Set(skills.map(s => s.category)));
  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'document': return '📄';
      case 'code': return '💻';
      case 'analysis': return '🔍';
      case 'automation': return '⚡';
      default: return '🛠';
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'document': return 'Document Generation';
      case 'code': return 'Code Tools';
      case 'analysis': return 'Analysis';
      case 'automation': return 'Automation';
      default: return 'Custom Skills';
    }
  };

  if (loading) return <div className="p-4 text-gray-400">Loading skills...</div>;

  return (
    <div className="skills-panel space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Skills</h3>
        <button onClick={loadSkills} className="text-sm text-blue-400 hover:text-blue-300">Refresh</button>
      </div>

      {skills.length === 0 ? (
        <p className="text-gray-400 text-sm">No skills available. Enable built-in skills in Settings.</p>
      ) : (
        <div className="space-y-2">
          {categories.map(category => {
            const categorySkills = skills.filter(s => s.category === category);
            const isExpanded = expandedCategory === category;

            return (
              <div key={category} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : category)}
                  className="w-full p-3 flex items-center gap-2 hover:bg-gray-800/50 transition-colors"
                >
                  <span>{getCategoryIcon(category)}</span>
                  <span className="font-medium">{getCategoryLabel(category)}</span>
                  <span className="text-xs text-gray-400 ml-auto">{categorySkills.length} skill{categorySkills.length !== 1 ? 's' : ''}</span>
                  <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                </button>

                {isExpanded && (
                  <div className="border-t p-2 space-y-1">
                    {categorySkills.map(skill => (
                      <div key={skill.id} className="p-2 rounded hover:bg-gray-800/30">
                        <div className="font-medium text-sm">{skill.name}</div>
                        <div className="text-xs text-gray-400">{skill.description}</div>
                        {skill.parameters.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {skill.parameters.map(p => (
                              <span key={p.name} className={`text-xs px-1.5 py-0.5 rounded ${p.required ? 'bg-blue-900/30 text-blue-300' : 'bg-gray-700 text-gray-400'}`}>
                                {p.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SkillsPanel;
