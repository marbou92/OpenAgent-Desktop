/**
 * OpenAgent-Desktop - Security Types
 */

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityFinding {
  type: 'prompt_injection' | 'suspicious_content' | 'data_exfiltration' | 'command_injection';
  severity: SecuritySeverity;
  confidence: number; // 0.0-1.0
  description: string;
  matchedPattern?: string;
  location: 'tool_result' | 'user_input' | 'file_content';
  timestamp: string;
}

export interface SecurityScanResult {
  findings: SecurityFinding[];
  isSafe: boolean;
  riskScore: number; // 0.0-1.0
  scannedAt: string;
  contentLength: number;
}

export interface SecurityConfig {
  enablePromptInjectionDetection: boolean;
  enableDataExfiltrationDetection: boolean;
  enableCommandInjectionDetection: boolean;
  maxRiskScore: number; // Block content above this score
  customPatterns: string[];
}
