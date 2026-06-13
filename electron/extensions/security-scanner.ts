/**
 * OpenAgent-Desktop - Extension Security Scanner
 * 
 * Pre-activation security scanning for extensions.
 * Like Goose: malware detection, risk scoring, suspicious pattern detection.
 */

import { EventEmitter } from 'events';

export interface SecurityScanResult {
  extensionName: string;
  isSafe: boolean;
  riskScore: number; // 0.0-1.0
  findings: SecurityFinding[];
  scannedAt: string;
}

export interface SecurityFinding {
  type: 'malware' | 'suspicious_command' | 'suspicious_url' | 'excessive_permissions' | 'known_bad';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  details?: string;
}

// Known malicious extension patterns
const MALICIOUS_PATTERNS: { pattern: RegExp; description: string }[] = [
  { pattern: /curl\s+.*\|\s*(ba)?sh/i, description: 'Downloads and executes remote script' },
  { pattern: /wget\s+.*\|\s*(ba)?sh/i, description: 'Downloads and executes remote script' },
  { pattern: /rm\s+-rf\s+\//i, description: 'Destructive file deletion' },
  { pattern: /\/dev\/tcp\//i, description: 'Reverse shell via /dev/tcp' },
  { pattern: /nc\s+-[el]/i, description: 'Netcat listener (potential reverse shell)' },
  { pattern: /base64\s+-d\s*\|/i, description: 'Decodes and pipes base64 (potential obfuscation)' },
  { pattern: /eval\s*\(/i, description: 'Uses eval() (potential code injection)' },
  { pattern: /chmod\s+777/i, description: 'Sets overly permissive file mode' },
];

const SUSPICIOUS_URLS: { pattern: RegExp; description: string }[] = [
  { pattern: /pastebin\.com/i, description: 'Pastebin URL (common in malware)' },
  { pattern: /bit\.ly/i, description: 'Shortened URL (hides destination)' },
  { pattern: /tinyurl\.com/i, description: 'Shortened URL (hides destination)' },
  { pattern: /ngrok\.io/i, description: 'Ngrok tunnel URL (potential C2)' },
];

export class ExtensionSecurityScanner extends EventEmitter {
  scan(config: { name: string; command?: string; args?: string[]; env?: Record<string, string>; url?: string }): SecurityScanResult {
    const findings: SecurityFinding[] = [];

    // Check command for malicious patterns
    if (config.command) {
      const fullCommand = [config.command, ...(config.args || [])].join(' ');
      
      for (const { pattern, description } of MALICIOUS_PATTERNS) {
        if (pattern.test(fullCommand)) {
          findings.push({
            type: 'malware',
            severity: 'critical',
            description,
            details: `Matched pattern in command: ${fullCommand.slice(0, 200)}`,
          });
        }
      }
    }

    // Check URLs
    const allText = [config.command, ...(config.args || []), Object.values(config.env || {}).join(' '), config.url].filter(Boolean).join(' ');
    
    for (const { pattern, description } of SUSPICIOUS_URLS) {
      if (pattern.test(allText)) {
        findings.push({
          type: 'suspicious_url',
          severity: 'medium',
          description,
        });
      }
    }

    // Check for excessive environment variables (potential data exfiltration)
    if (config.env) {
      const envKeys = Object.keys(config.env);
      const sensitiveKeys = envKeys.filter((k) => 
        /password|secret|token|key|credential|private/i.test(k)
      );
      if (sensitiveKeys.length > 3) {
        findings.push({
          type: 'excessive_permissions',
          severity: 'high',
          description: `Requests ${sensitiveKeys.length} sensitive environment variables`,
          details: sensitiveKeys.join(', '),
        });
      }
    }

    // Calculate risk score
    const riskScore = this.calculateRiskScore(findings);
    const isSafe = riskScore < 0.5;

    const result: SecurityScanResult = {
      extensionName: config.name,
      isSafe,
      riskScore,
      findings,
      scannedAt: new Date().toISOString(),
    };

    if (!isSafe) {
      this.emit('security:unsafe', result);
    }

    return result;
  }

  private calculateRiskScore(findings: SecurityFinding[]): number {
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
      maxScore = Math.max(maxScore, severityScore);
    }

    // Multiple findings increase risk
    const countBonus = Math.min(findings.length * 0.05, 0.2);
    return Math.min(maxScore + countBonus, 1.0);
  }
}
