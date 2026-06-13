/**
 * OpenAgent-Desktop - Auto Mode Detection
 *
 * Intelligently suggests agent mode based on user input.
 * Inspired by OpenCode's Build/Plan detection and Goose's Auto mode.
 * Analyzes prompts to suggest the most appropriate agent mode.
 */

import { AgentMode } from './types';

export interface ModeDetectionResult {
  mode: AgentMode;
  confidence: number;
  reason: string;
}

interface ModePattern {
  keywords: string[];
  mode: AgentMode;
  weight: number;
  description: string;
}

/**
 * Pattern definitions for auto mode detection.
 * Each pattern has keywords, a target mode, a weight (importance), and a description.
 */
const MODE_PATTERNS: ModePattern[] = [
  // ── Plan mode patterns ──────────────────────────────────────────────────────
  { keywords: ['plan', 'plans', 'planning'], mode: AgentMode.plan, weight: 3.0, description: 'Planning keyword detected' },
  { keywords: ['analyze', 'analysis', 'analyzing'], mode: AgentMode.plan, weight: 3.0, description: 'Analysis keyword detected' },
  { keywords: ['review', 'reviewing', 'code review'], mode: AgentMode.plan, weight: 3.0, description: 'Review keyword detected' },
  { keywords: ['what would', 'how should', 'what could'], mode: AgentMode.plan, weight: 2.5, description: 'Advisory question detected' },
  { keywords: ['architecture', 'design', 'architect'], mode: AgentMode.plan, weight: 2.5, description: 'Architecture/design keyword detected' },
  { keywords: ['investigate', 'investigation'], mode: AgentMode.plan, weight: 2.0, description: 'Investigation keyword detected' },
  { keywords: ['audit', 'auditing'], mode: AgentMode.plan, weight: 2.5, description: 'Audit keyword detected' },
  { keywords: ['evaluate', 'evaluation', 'assess', 'assessment'], mode: AgentMode.plan, weight: 2.0, description: 'Evaluation keyword detected' },
  { keywords: ['compare', 'comparison'], mode: AgentMode.plan, weight: 1.5, description: 'Comparison keyword detected' },
  { keywords: ['recommend', 'recommendation', 'suggestions', 'suggest'], mode: AgentMode.plan, weight: 2.0, description: 'Recommendation keyword detected' },
  { keywords: ['explore', 'looking at', 'look at'], mode: AgentMode.plan, weight: 1.5, description: 'Exploration keyword detected' },

  // ── Build mode patterns ─────────────────────────────────────────────────────
  { keywords: ['build', 'building'], mode: AgentMode.build, weight: 3.0, description: 'Build keyword detected' },
  { keywords: ['implement', 'implementation', 'implementing'], mode: AgentMode.build, weight: 3.0, description: 'Implementation keyword detected' },
  { keywords: ['create', 'creating'], mode: AgentMode.build, weight: 2.5, description: 'Create keyword detected' },
  { keywords: ['fix', 'fixing', 'fixes'], mode: AgentMode.build, weight: 3.0, description: 'Fix keyword detected' },
  { keywords: ['refactor', 'refactoring'], mode: AgentMode.build, weight: 2.5, description: 'Refactor keyword detected' },
  { keywords: ['add', 'adding'], mode: AgentMode.build, weight: 1.5, description: 'Add keyword detected' },
  { keywords: ['remove', 'removing', 'delete', 'deleting'], mode: AgentMode.build, weight: 2.0, description: 'Delete/remove keyword detected' },
  { keywords: ['update', 'updating', 'modify', 'modifying'], mode: AgentMode.build, weight: 2.0, description: 'Update/modify keyword detected' },
  { keywords: ['install', 'installing', 'setup', 'set up'], mode: AgentMode.build, weight: 2.0, description: 'Install/setup keyword detected' },
  { keywords: ['deploy', 'deploying'], mode: AgentMode.build, weight: 2.0, description: 'Deploy keyword detected' },
  { keywords: ['migrate', 'migration', 'migrating'], mode: AgentMode.build, weight: 2.0, description: 'Migration keyword detected' },
  { keywords: ['write', 'writing'], mode: AgentMode.build, weight: 1.5, description: 'Write keyword detected' },
  { keywords: ['generate', 'generating', 'scaffold'], mode: AgentMode.build, weight: 2.0, description: 'Generate/scaffold keyword detected' },

  // ── Chat mode patterns ──────────────────────────────────────────────────────
  { keywords: ['chat', 'tell me', 'lets talk'], mode: AgentMode.chat, weight: 2.0, description: 'Chat keyword detected' },
  { keywords: ['explain', 'explaining'], mode: AgentMode.chat, weight: 2.5, description: 'Explain keyword detected' },
  { keywords: ['what is', 'what are', 'whats'], mode: AgentMode.chat, weight: 2.0, description: 'Definition question detected' },
  { keywords: ['how does', 'how do', 'how can'], mode: AgentMode.chat, weight: 1.5, description: 'How question detected' },
  { keywords: ['why does', 'why do', 'why is'], mode: AgentMode.chat, weight: 1.5, description: 'Why question detected' },
  { keywords: ['help me understand', 'help understand'], mode: AgentMode.chat, weight: 2.5, description: 'Understanding request detected' },
  { keywords: ['teach', 'teaching', 'learn'], mode: AgentMode.chat, weight: 2.0, description: 'Learning keyword detected' },
  { keywords: ['describe', 'describing'], mode: AgentMode.chat, weight: 1.5, description: 'Description keyword detected' },

  // ── Smart mode patterns ─────────────────────────────────────────────────────
  { keywords: ['smart', 'careful', 'safe', 'cautious'], mode: AgentMode.smart, weight: 2.5, description: 'Safety keyword detected' },
  { keywords: ['approve', 'approval', 'confirm'], mode: AgentMode.smart, weight: 2.0, description: 'Approval keyword detected' },
  { keywords: ['step by step', 'one step at a time'], mode: AgentMode.smart, weight: 2.0, description: 'Cautious approach detected' },
  { keywords: ['review before', 'check before', 'ask before'], mode: AgentMode.smart, weight: 2.5, description: 'Pre-approval request detected' },
  { keywords: ['carefully', 'with caution', 'proceed carefully'], mode: AgentMode.smart, weight: 2.0, description: 'Careful operation detected' },
];

/**
 * File path / code reference patterns that suggest build or plan mode.
 */
const CODE_INDICATORS = {
  filePath: /(?:^|\s)(?:\/[\w.-]+\/|~\/|\.\/|\.\.\/|src\/|lib\/|test\/|tests\/|app\/|components\/|modules\/)[\w./-]+/i,
  codeBlock: /`[^`]+`/,
  multiLineCode: /```[\s\S]*?```/,
  fileExtension: /\.\w{1,4}(?:\s|$|:|,)/,
  lineNumber: /:?\d+$/,
  className: /\b[A-Z][a-zA-Z0-9]+(?:Class|Component|Service|Handler|Manager|Controller|Module)\b/,
};

/**
 * Question patterns that influence mode selection.
 */
const QUESTION_PATTERNS = {
  directQuestion: /\?$/,
  multipleQuestions: /\?.*\?/,
  startsWithQuestionWord: /^(what|who|where|when|why|how|which|whom|whose)\b/i,
  imperativeCommand: /^(please\s+)?(create|make|build|fix|implement|add|remove|update|delete|write|generate|install|deploy|run)\b/i,
};

export class AutoModeDetector {
  private customPatterns: ModePattern[] = [];

  /**
   * Add custom detection patterns.
   */
  addPatterns(patterns: ModePattern[]): void {
    this.customPatterns.push(...patterns);
  }

  /**
   * Detect the most appropriate agent mode for a given prompt.
   *
   * @param prompt - The user's input prompt
   * @returns Detection result with mode, confidence (0-1), and reason
   */
  detectMode(prompt: string): ModeDetectionResult {
    const normalizedPrompt = prompt.trim().toLowerCase();

    if (!normalizedPrompt) {
      return {
        mode: AgentMode.chat,
        confidence: 0.3,
        reason: 'Empty prompt defaults to chat mode',
      };
    }

    // Score each mode based on pattern matches
    const scores: Record<AgentMode, number> = {
      [AgentMode.build]: 0,
      [AgentMode.plan]: 0,
      [AgentMode.chat]: 0,
      [AgentMode.smart]: 0,
    };
    const reasons: Record<AgentMode, string[]> = {
      [AgentMode.build]: [],
      [AgentMode.plan]: [],
      [AgentMode.chat]: [],
      [AgentMode.smart]: [],
    };

    // Apply all patterns (built-in + custom)
    const allPatterns = [...MODE_PATTERNS, ...this.customPatterns];
    for (const pattern of allPatterns) {
      for (const keyword of pattern.keywords) {
        // Use word boundary matching for more accurate detection
        const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
        if (regex.test(normalizedPrompt)) {
          scores[pattern.mode] += pattern.weight;
          reasons[pattern.mode].push(pattern.description);
        }
      }
    }

    // Apply structural heuristics
    this.applyStructuralHeuristics(normalizedPrompt, prompt, scores, reasons);

    // Determine the best mode
    const totalScore = Object.values(scores).reduce((sum, s) => sum + s, 0);
    if (totalScore === 0) {
      // No patterns matched — use context-free heuristics
      return this.fallbackDetection(normalizedPrompt, prompt);
    }

    // Find mode with highest score
    let bestMode = AgentMode.chat;
    let bestScore = 0;
    for (const [mode, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestMode = mode as AgentMode;
      }
    }

    // Calculate confidence (0-1 scale)
    const confidence = Math.min(0.95, bestScore / (totalScore * 0.6 + bestScore * 0.4));

    // Deduplicate reasons
    const uniqueReasons = [...new Set(reasons[bestMode])].slice(0, 3);

    return {
      mode: bestMode,
      confidence: Math.round(confidence * 100) / 100,
      reason: uniqueReasons.length > 0
        ? uniqueReasons.join('; ')
        : `Detected ${bestMode} mode from prompt structure`,
    };
  }

  /**
   * Apply structural heuristics based on prompt characteristics.
   */
  private applyStructuralHeuristics(
    normalizedPrompt: string,
    originalPrompt: string,
    scores: Record<AgentMode, number>,
    reasons: Record<AgentMode, string[]>,
  ): void {
    // Question marks suggest chat or plan mode
    const questionCount = (normalizedPrompt.match(/\?/g) || []).length;
    if (questionCount > 0) {
      scores[AgentMode.chat] += 0.5 * questionCount;
      reasons[AgentMode.chat].push('Question detected');
    }

    // Multiple questions suggest plan/analysis mode
    if (questionCount >= 2) {
      scores[AgentMode.plan] += 1.0;
      reasons[AgentMode.plan].push('Multiple questions suggest analysis');
    }

    // Starts with question word → likely chat or plan
    if (QUESTION_PATTERNS.startsWithQuestionWord.test(normalizedPrompt)) {
      scores[AgentMode.chat] += 1.0;
      reasons[AgentMode.chat].push('Question word detected');
    }

    // Imperative command → likely build mode
    if (QUESTION_PATTERNS.imperativeCommand.test(originalPrompt)) {
      scores[AgentMode.build] += 2.0;
      reasons[AgentMode.build].push('Imperative command detected');
    }

    // Code references → build or plan mode
    if (CODE_INDICATORS.filePath.test(originalPrompt)) {
      scores[AgentMode.build] += 1.5;
      scores[AgentMode.plan] += 0.5;
      reasons[AgentMode.build].push('File path reference detected');
    }

    if (CODE_INDICATORS.codeBlock.test(originalPrompt)) {
      scores[AgentMode.build] += 1.0;
      reasons[AgentMode.build].push('Inline code reference detected');
    }

    if (CODE_INDICATORS.multiLineCode.test(originalPrompt)) {
      scores[AgentMode.build] += 1.5;
      reasons[AgentMode.build].push('Code block detected');
    }

    if (CODE_INDICATORS.fileExtension.test(originalPrompt)) {
      scores[AgentMode.build] += 0.5;
      reasons[AgentMode.build].push('File extension reference detected');
    }

    if (CODE_INDICATORS.className.test(originalPrompt)) {
      scores[AgentMode.build] += 0.5;
      scores[AgentMode.plan] += 0.3;
      reasons[AgentMode.build].push('Class name reference detected');
    }

    // Long prompts tend to be about building/implementing
    const wordCount = normalizedPrompt.split(/\s+/).length;
    if (wordCount > 50) {
      scores[AgentMode.build] += 1.0;
      reasons[AgentMode.build].push('Long prompt suggests complex task');
    } else if (wordCount > 20) {
      scores[AgentMode.plan] += 0.5;
      reasons[AgentMode.plan].push('Medium-length prompt may need planning');
    }

    // Short prompts with no action words tend to be chat
    if (wordCount <= 5 && !QUESTION_PATTERNS.imperativeCommand.test(originalPrompt)) {
      scores[AgentMode.chat] += 1.0;
      reasons[AgentMode.chat].push('Short prompt suggests quick question');
    }

    // "should I" or "would you recommend" patterns → plan
    if (/\bshould i\b|\bwould you recommend\b|\bbetter (?:to|approach)\b/i.test(normalizedPrompt)) {
      scores[AgentMode.plan] += 2.0;
      reasons[AgentMode.plan].push('Advisory question pattern detected');
    }

    // Error / bug patterns → build mode (fixing)
    if (/\berror\b|\bbug\b|\bcrash\b|\bexception\b|\bstack trace\b|\btraceback\b/i.test(normalizedPrompt)) {
      scores[AgentMode.build] += 2.5;
      reasons[AgentMode.build].push('Error/bug keyword detected');
    }

    // Test patterns → build mode
    if (/\btest\b|\btesting\b|\bspec\b|\bunit test\b|\bintegration test\b/i.test(normalizedPrompt)) {
      scores[AgentMode.build] += 1.5;
      reasons[AgentMode.build].push('Test keyword detected');
    }

    // Security patterns → plan or smart mode
    if (/\bsecurity\b|\bvulnerability\b|\bcve\b|\bexploit\b|\bsecure\b/i.test(normalizedPrompt)) {
      scores[AgentMode.plan] += 2.0;
      scores[AgentMode.smart] += 1.0;
      reasons[AgentMode.plan].push('Security analysis keyword detected');
    }

    // Performance patterns → plan mode
    if (/\bperformance\b|\boptimize\b|\bslow\b|\bbottleneck\b|\bprofiling\b/i.test(normalizedPrompt)) {
      scores[AgentMode.plan] += 1.5;
      reasons[AgentMode.plan].push('Performance analysis keyword detected');
    }
  }

  /**
   * Fallback detection when no patterns match.
   */
  private fallbackDetection(normalizedPrompt: string, originalPrompt: string): ModeDetectionResult {
    const wordCount = normalizedPrompt.split(/\s+/).length;

    // Very short prompts → chat
    if (wordCount <= 3) {
      return {
        mode: AgentMode.chat,
        confidence: 0.4,
        reason: 'Short prompt defaults to chat mode',
      };
    }

    // Has question mark → chat
    if (normalizedPrompt.endsWith('?')) {
      return {
        mode: AgentMode.chat,
        confidence: 0.5,
        reason: 'Question detected, defaulting to chat mode',
      };
    }

    // Has code references → build
    if (CODE_INDICATORS.filePath.test(originalPrompt) || CODE_INDICATORS.codeBlock.test(originalPrompt)) {
      return {
        mode: AgentMode.build,
        confidence: 0.5,
        reason: 'Code references detected, suggesting build mode',
      };
    }

    // Imperative → build
    if (QUESTION_PATTERNS.imperativeCommand.test(originalPrompt)) {
      return {
        mode: AgentMode.build,
        confidence: 0.5,
        reason: 'Command-style prompt detected, suggesting build mode',
      };
    }

    // Medium length, no clear signal → plan (safe default for exploration)
    if (wordCount > 10) {
      return {
        mode: AgentMode.plan,
        confidence: 0.35,
        reason: 'Moderate complexity prompt, suggesting plan mode for safety',
      };
    }

    // Default to chat
    return {
      mode: AgentMode.chat,
      confidence: 0.3,
      reason: 'No clear signal detected, defaulting to chat mode',
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────────

let detectorInstance: AutoModeDetector | null = null;

export function getAutoModeDetector(): AutoModeDetector {
  if (!detectorInstance) {
    detectorInstance = new AutoModeDetector();
  }
  return detectorInstance;
}

export function setAutoModeDetector(detector: AutoModeDetector): void {
  detectorInstance = detector;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
