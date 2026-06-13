/**
 * OpenAgent-Desktop - Prompt Injection Scanner
 * 
 * Scans tool results and user inputs for prompt injection attacks.
 * Like Goose: pattern-based detection + suspicious content flagging.
 */

import { EventEmitter } from 'events';
import { SecurityFinding, SecurityScanResult, SecurityConfig, SecuritySeverity } from './types';

const INJECTION_PATTERNS: { pattern: RegExp; severity: SecuritySeverity; description: string }[] = [
  {
    pattern: /ignore\s+(all\s+)?previous\s+(instructions|prompts|directions)/i,
    severity: 'critical',
    description: 'Attempt to ignore previous instructions',
  },
  {
    pattern: /forget\s+(everything|all|your\s+(instructions|role|identity))/i,
    severity: 'critical',
    description: 'Attempt to make the agent forget instructions',
  },
  {
    pattern: /you\s+are\s+now\s+a/i,
    severity: 'high',
    description: 'Attempt to change agent role',
  },
  {
    pattern: /system\s*:\s*/i,
    severity: 'high',
    description: 'Attempt to inject system-level instructions',
  },
  {
    pattern: /\[SYSTEM\]|\[ADMIN\]|\[OVERRIDE\]/i,
    severity: 'high',
    description: 'Fake system/admin/override tags',
  },
  {
    pattern: /new\s+instruction\s*:/i,
    severity: 'high',
    description: 'New instruction injection attempt',
  },
  {
    pattern: /disregard\s+(all\s+)?(previous|above|prior)/i,
    severity: 'high',
    description: 'Attempt to disregard previous context',
  },
  {
    pattern: /do\s+not\s+(follow|obey|comply\s+with)\s+(your|the)\s+(original|initial|previous)/i,
    severity: 'high',
    description: 'Attempt to override original instructions',
  },
  {
    pattern: /reveal|show|print|display|output\s+(your|the|my)\s+(system|initial|original)\s+(prompt|instructions)/i,
    severity: 'medium',
    description: 'Attempt to extract system prompt',
  },
  {
    pattern: /export\s+(all|your)\s+(data|knowledge|instructions)/i,
    severity: 'medium',
    description: 'Data exfiltration attempt',
  },
];

const COMMAND_INJECTION_PATTERNS: { pattern: RegExp; severity: SecuritySeverity; description: string }[] = [
  {
    pattern: /;\s*rm\s+-rf\s+\//i,
    severity: 'critical',
    description: 'Destructive rm command',
  },
  {
    pattern: /\|\s*nc\s+/i,
    severity: 'high',
    description: 'Netcat pipe (potential reverse shell)',
  },
  {
    pattern: /curl\s+.*\|\s*(ba)?sh/i,
    severity: 'critical',
    description: 'Remote script execution',
  },
  {
    pattern: /chmod\s+777/i,
    severity: 'medium',
    description: 'Overly permissive file mode',
  },
  {
    pattern: /wget\s+.*\|\s*(ba)?sh/i,
    severity: 'critical',
    description: 'Remote script download and execution',
  },
];

export class InjectionScanner extends EventEmitter {
  private config: SecurityConfig;

  constructor(config?: Partial<SecurityConfig>) {
    super();
    this.config = {
      enablePromptInjectionDetection: config?.enablePromptInjectionDetection ?? true,
      enableDataExfiltrationDetection: config?.enableDataExfiltrationDetection ?? true,
      enableCommandInjectionDetection: config?.enableCommandInjectionDetection ?? true,
      maxRiskScore: config?.maxRiskScore ?? 0.7,
      customPatterns: config?.customPatterns ?? [],
    };
  }

  scan(content: string, location: SecurityFinding['location'] = 'tool_result'): SecurityScanResult {
    const findings: SecurityFinding[] = [];

    // Prompt injection detection
    if (this.config.enablePromptInjectionDetection) {
      for (const { pattern, severity, description } of INJECTION_PATTERNS) {
        const match = content.match(pattern);
        if (match) {
          findings.push({
            type: 'prompt_injection',
            severity,
            confidence: this.calculateConfidence(match[0], content),
            description,
            matchedPattern: match[0],
            location,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    // Command injection detection
    if (this.config.enableCommandInjectionDetection && location === 'tool_result') {
      for (const { pattern, severity, description } of COMMAND_INJECTION_PATTERNS) {
        const match = content.match(pattern);
        if (match) {
          findings.push({
            type: 'command_injection',
            severity,
            confidence: this.calculateConfidence(match[0], content),
            description,
            matchedPattern: match[0],
            location,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    // Custom patterns
    for (const customPattern of this.config.customPatterns) {
      try {
        const regex = new RegExp(customPattern, 'i');
        const match = content.match(regex);
        if (match) {
          findings.push({
            type: 'suspicious_content',
            severity: 'medium',
            confidence: 0.5,
            description: `Matched custom security pattern`,
            matchedPattern: match[0],
            location,
            timestamp: new Date().toISOString(),
          });
        }
      } catch {
        // Invalid regex, skip
      }
    }

    const riskScore = this.calculateRiskScore(findings, content);
    const isSafe = riskScore < this.config.maxRiskScore;

    const result: SecurityScanResult = {
      findings,
      isSafe,
      riskScore,
      scannedAt: new Date().toISOString(),
      contentLength: content.length,
    };

    if (!isSafe) {
      this.emit('security:blocked', result);
    } else if (findings.length > 0) {
      this.emit('security:warning', result);
    }

    return result;
  }

  private calculateConfidence(match: string, content: string): number {
    // Higher confidence if match is at the beginning or in a prominent position
    const position = content.toLowerCase().indexOf(match.toLowerCase());
    const relativePosition = position / Math.max(content.length, 1);
    
    // Earlier in content = higher confidence
    const positionBonus = Math.max(0, 1 - relativePosition);
    
    // Longer matches = higher confidence
    const lengthBonus = Math.min(match.length / 50, 1);
    
    return Math.min(0.4 + positionBonus * 0.3 + lengthBonus * 0.3, 1.0);
  }

  private calculateRiskScore(findings: SecurityFinding[], content: string): number {
    if (findings.length === 0) return 0;

    let maxScore = 0;
    for (const finding of findings) {
      let severityScore: number;
      switch (finding.severity) {
        case 'critical': severityScore = 1.0; break;
        case 'high': severityScore = 0.7; break;
        case 'medium': severityScore = 0.4; break;
        case 'low': severityScore = 0.2; break;
      }
      const score = severityScore * finding.confidence;
      maxScore = Math.max(maxScore, score);
    }

    return maxScore;
  }
}
