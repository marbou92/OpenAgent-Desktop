/**
 * OpenAgent-Desktop - Computer Use Overlay UI Component
 *
 * React component for the computer use overlay:
 * - Transparent overlay that shows on top of content
 * - Click visualization: ripple effect at click coordinates
 * - Type visualization: floating keystroke display
 * - Scroll visualization: directional arrows
 * - Region highlighting: colored rectangle with label
 * - Action log: list of recent actions with timestamps
 * - Controls: Pause/Resume/Stop buttons
 * - Transparency slider
 * - Screenshot viewer with annotations
 * - Recording indicator (pulsing red dot)
 * - Confirmation dialog for destructive actions
 * - Action replay controls
 * - Dark theme with semi-transparent backgrounds
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

const api = (window as any).openagent;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ComputerUseAction {
  id: string;
  type: 'click' | 'type' | 'scroll' | 'screenshot' | 'drag';
  coordinates?: { x: number; y: number };
  text?: string;
  duration?: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

type OverlayState = 'hidden' | 'showing' | 'recording' | 'paused';

interface HighlightRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  color?: string;
}

interface ConfirmationRequest {
  action: ComputerUseAction;
  reason: string;
}

interface ComputerUseOverlayProps {
  isVisible?: boolean;
  onToggle?: (visible: boolean) => void;
  addToast?: (toast: { type: 'success' | 'error' | 'info'; title: string; message?: string }) => void;
}

// ─── Ripple Effect Component ──────────────────────────────────────────────────

const RippleEffect: React.FC<{ x: number; y: number; onDone: () => void }> = ({ x, y, onDone }) => {
  const [scale, setScale] = useState(0);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    requestAnimationFrame(() => {
      setScale(1);
      setOpacity(0);
    });
    const timer = setTimeout(onDone, 800);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: x - 20, top: y - 20 }}
    >
      <div
        className="w-10 h-10 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(239,68,68,0.6) 0%, rgba(239,68,68,0) 70%)',
          transform: `scale(${scale * 3})`,
          opacity,
          transition: 'all 0.8s ease-out',
        }}
      />
      {/* Center dot */}
      <div
        className="absolute"
        style={{
          left: 8,
          top: 8,
          width: 4,
          height: 4,
          borderRadius: '50%',
          background: '#ef4444',
          opacity: opacity * 1.5,
        }}
      />
    </div>
  );
};

// ─── Scroll Arrow Component ──────────────────────────────────────────────────

const ScrollArrow: React.FC<{
  direction: 'up' | 'down' | 'left' | 'right';
  x: number;
  y: number;
  onDone: () => void;
}> = ({ direction, x, y, onDone }) => {
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setOpacity(0);
    }, 200);
    const removeTimer = setTimeout(onDone, 1000);
    return () => {
      clearTimeout(timer);
      clearTimeout(removeTimer);
    };
  }, [onDone]);

  const rotation =
    direction === 'up' ? -90 :
    direction === 'down' ? 90 :
    direction === 'left' ? 180 : 0;

  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: x - 16, top: y - 16, opacity, transition: 'opacity 0.8s ease-out' }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(59,130,246,0.2)',
          borderRadius: '50%',
          border: '2px solid rgba(59,130,246,0.4)',
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </div>
    </div>
  );
};

// ─── Typing Display Component ────────────────────────────────────────────────

const TypingDisplay: React.FC<{
  text: string;
  x: number;
  y: number;
  onDone: () => void;
}> = ({ text, x, y, onDone }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
    }, 1500);
    const removeTimer = setTimeout(onDone, 2500);
    return () => {
      clearTimeout(timer);
      clearTimeout(removeTimer);
    };
  }, [onDone]);

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: x + 10,
        top: y - 30,
        opacity: visible ? 1 : 0,
        transition: 'opacity 1s ease-out',
      }}
    >
      <div
        className="px-3 py-1.5 rounded-lg text-sm font-mono"
        style={{
          background: 'rgba(139,92,246,0.2)',
          border: '1px solid rgba(139,92,246,0.3)',
          color: '#a78bfa',
          backdropFilter: 'blur(4px)',
          maxWidth: 300,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        ⌨️ {text}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const ComputerUseOverlay: React.FC<ComputerUseOverlayProps> = ({
  isVisible: externalVisible,
  onToggle,
  addToast,
}) => {
  const [state, setState] = useState<OverlayState>('hidden');
  const [actions, setActions] = useState<ComputerUseAction[]>([]);
  const [highlights, setHighlights] = useState<HighlightRegion[]>([]);
  const [ripples, setRipples] = useState<Array<{ id: string; x: number; y: number }>>([]);
  const [scrollArrows, setScrollArrows] = useState<Array<{ id: string; direction: 'up' | 'down' | 'left' | 'right'; x: number; y: number }>>([]);
  const [typingDisplays, setTypingDisplays] = useState<Array<{ id: string; text: string; x: number; y: number }>>([]);
  const [transparency, setTransparency] = useState(0.7);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [showActionLog, setShowActionLog] = useState(true);
  const [showScreenshot, setShowScreenshot] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const replayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isVisible = externalVisible !== undefined ? externalVisible : state !== 'hidden';

  // ─── Event listeners ───────────────────────────────────────────────────────

  useEffect(() => {
    // Listen for overlay events from the main process
    const handleActionRecorded = (action: ComputerUseAction) => {
      setActions((prev) => [...prev, action]);
      visualizeAction(action);
    };

    const handleActionExecuted = (action: ComputerUseAction) => {
      visualizeAction(action);
    };

    const handleConfirmationRequested = (data: { action: ComputerUseAction; check: { reason: string } }) => {
      setConfirmation({
        action: data.action,
        reason: data.check.reason,
      });
    };

    const handleStateChanged = (newState: OverlayState) => {
      setState(newState);
    };

    // Register listeners
    if (api?.computerUseOverlay) {
      api.computerUseOverlay.on?.('action:recorded', handleActionRecorded);
      api.computerUseOverlay.on?.('action:executed', handleActionExecuted);
      api.computerUseOverlay.on?.('confirmation:requested', handleConfirmationRequested);
      api.computerUseOverlay.on?.('state:changed', handleStateChanged);
    }

    return () => {
      if (api?.computerUseOverlay) {
        api.computerUseOverlay.off?.('action:recorded', handleActionRecorded);
        api.computerUseOverlay.off?.('action:executed', handleActionExecuted);
        api.computerUseOverlay.off?.('confirmation:requested', handleConfirmationRequested);
        api.computerUseOverlay.off?.('state:changed', handleStateChanged);
      }
    };
  }, []);

  // ─── Visualization ─────────────────────────────────────────────────────────

  const visualizeAction = useCallback((action: ComputerUseAction) => {
    switch (action.type) {
      case 'click':
        if (action.coordinates) {
          const id = `ripple-${Date.now()}`;
          setRipples((prev) => [...prev, { id, x: action.coordinates!.x, y: action.coordinates!.y }]);
        }
        break;
      case 'type':
        if (action.coordinates && action.text) {
          const id = `type-${Date.now()}`;
          setTypingDisplays((prev) => [
            ...prev,
            { id, text: action.text!, x: action.coordinates!.x, y: action.coordinates!.y },
          ]);
        } else if (action.text) {
          // Show at bottom center if no coordinates
          const id = `type-${Date.now()}`;
          setTypingDisplays((prev) => [
            ...prev,
            { id, text: action.text!, x: window.innerWidth / 2, y: window.innerHeight - 100 },
          ]);
        }
        break;
      case 'scroll':
        if (action.coordinates) {
          const direction = (action.metadata?.direction as 'up' | 'down' | 'left' | 'right') || 'down';
          const id = `scroll-${Date.now()}`;
          setScrollArrows((prev) => [
            ...prev,
            { id, direction, x: action.coordinates!.x, y: action.coordinates!.y },
          ]);
        }
        break;
      case 'drag':
        // Highlight drag path
        break;
      case 'screenshot':
        // Flash effect
        break;
    }
  }, []);

  const removeRipple = useCallback((id: string) => {
    setRipples((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const removeScrollArrow = useCallback((id: string) => {
    setScrollArrows((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const removeTypingDisplay = useCallback((id: string) => {
    setTypingDisplays((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ─── Controls ──────────────────────────────────────────────────────────────

  const handleShow = () => {
    if (api?.computerUseOverlay?.showOverlay) {
      api.computerUseOverlay.showOverlay();
    } else {
      setState('showing');
    }
    onToggle?.(true);
  };

  const handleHide = () => {
    if (api?.computerUseOverlay?.hideOverlay) {
      api.computerUseOverlay.hideOverlay();
    } else {
      setState('hidden');
    }
    onToggle?.(false);
  };

  const handleStartRecording = () => {
    if (api?.computerUseOverlay?.startRecording) {
      api.computerUseOverlay.startRecording();
    } else {
      setState('recording');
      setActions([]);
    }
  };

  const handleStopRecording = () => {
    if (api?.computerUseOverlay?.stopRecording) {
      api.computerUseOverlay.stopRecording();
    } else {
      setState('showing');
    }
  };

  const handlePause = () => {
    if (api?.computerUseOverlay?.pauseRecording) {
      api.computerUseOverlay.pauseRecording();
    } else {
      setState('paused');
    }
  };

  const handleResume = () => {
    if (api?.computerUseOverlay?.resumeRecording) {
      api.computerUseOverlay.resumeRecording();
    } else {
      setState('recording');
    }
  };

  const handleScreenshot = async () => {
    if (api?.computerUseOverlay?.captureScreenshot) {
      try {
        const buffer = await api.computerUseOverlay.captureScreenshot();
        if (buffer) {
          // In production, this would be a data URL from the actual screenshot
          setScreenshotUrl(`data:image/png;base64,${Buffer.from(buffer).toString('base64')}`);
          setShowScreenshot(true);
        }
      } catch (err: any) {
        addToast?.({ type: 'error', title: 'Screenshot failed', message: err.message });
      }
    }
  };

  const handleConfirmAction = (approved: boolean) => {
    if (api?.computerUseOverlay?.resolveConfirmation) {
      api.computerUseOverlay.resolveConfirmation(approved);
    }
    setConfirmation(null);
    if (approved) {
      addToast?.({ type: 'info', title: 'Action approved' });
    } else {
      addToast?.({ type: 'info', title: 'Action cancelled' });
    }
  };

  const handleReplay = () => {
    if (actions.length === 0) return;
    setIsReplaying(true);
    setReplayIndex(0);

    let index = 0;
    const replayNext = () => {
      if (index >= actions.length) {
        setIsReplaying(false);
        setReplayIndex(0);
        return;
      }

      setReplayIndex(index);
      visualizeAction(actions[index]);
      index++;

      const delay = 500 / replaySpeed;
      replayTimerRef.current = setTimeout(replayNext, delay);
    };

    replayNext();
  };

  const handleAbortReplay = () => {
    if (replayTimerRef.current) {
      clearTimeout(replayTimerRef.current);
      replayTimerRef.current = null;
    }
    setIsReplaying(false);
    setReplayIndex(0);

    if (api?.computerUseOverlay?.abortReplay) {
      api.computerUseOverlay.abortReplay();
    }
  };

  const handleTransparencyChange = (value: number) => {
    setTransparency(value);
    if (api?.computerUseOverlay?.setTransparency) {
      api.computerUseOverlay.setTransparency(value);
    }
  };

  // ─── Action icon helper ────────────────────────────────────────────────────

  const getActionIcon = (type: ComputerUseAction['type']): string => {
    switch (type) {
      case 'click': return '👆';
      case 'type': return '⌨️';
      case 'scroll': return '🔄';
      case 'screenshot': return '📸';
      case 'drag': return '✋';
      default: return '⚡';
    }
  };

  const getActionColor = (type: ComputerUseAction['type']): string => {
    switch (type) {
      case 'click': return '#ef4444';
      case 'type': return '#8b5cf6';
      case 'scroll': return '#3b82f6';
      case 'screenshot': return '#f59e0b';
      case 'drag': return '#22c55e';
      default: return '#6b7280';
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Overlay Layer (when visible) */}
      {isVisible && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-40 pointer-events-none"
          style={{
            background: `rgba(0, 0, 0, ${(1 - transparency) * 0.15})`,
          }}
        >
          {/* Ripple effects */}
          {ripples.map((ripple) => (
            <RippleEffect
              key={ripple.id}
              x={ripple.x}
              y={ripple.y}
              onDone={() => removeRipple(ripple.id)}
            />
          ))}

          {/* Scroll arrows */}
          {scrollArrows.map((arrow) => (
            <ScrollArrow
              key={arrow.id}
              direction={arrow.direction}
              x={arrow.x}
              y={arrow.y}
              onDone={() => removeScrollArrow(arrow.id)}
            />
          ))}

          {/* Typing displays */}
          {typingDisplays.map((display) => (
            <TypingDisplay
              key={display.id}
              text={display.text}
              x={display.x}
              y={display.y}
              onDone={() => removeTypingDisplay(display.id)}
            />
          ))}

          {/* Region highlights */}
          {highlights.map((region, idx) => (
            <div
              key={idx}
              className="absolute pointer-events-none"
              style={{
                left: region.x,
                top: region.y,
                width: region.width,
                height: region.height,
                border: `2px solid ${region.color || '#ef4444'}`,
                background: `${region.color || '#ef4444'}20`,
                borderRadius: 4,
              }}
            >
              {region.label && (
                <span
                  className="absolute -top-5 left-0 text-xs px-1.5 py-0.5 rounded whitespace-nowrap"
                  style={{
                    background: region.color || '#ef4444',
                    color: 'white',
                    fontSize: 10,
                  }}
                >
                  {region.label}
                </span>
              )}
            </div>
          ))}

          {/* Recording indicator */}
          {state === 'recording' && (
            <div
              className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none flex items-center gap-2 px-4 py-2 rounded-full"
              style={{
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.3)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div
                className="w-2.5 h-2.5 rounded-full animate-pulse"
                style={{ background: '#ef4444' }}
              />
              <span className="text-sm font-medium" style={{ color: '#ef4444' }}>
                Recording
              </span>
              <span className="text-xs" style={{ color: 'rgba(239,68,68,0.7)' }}>
                {actions.length} actions
              </span>
            </div>
          )}

          {/* Paused indicator */}
          {state === 'paused' && (
            <div
              className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none flex items-center gap-2 px-4 py-2 rounded-full"
              style={{
                background: 'rgba(245,158,11,0.15)',
                border: '1px solid rgba(245,158,11,0.3)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#f59e0b' }} />
              <span className="text-sm font-medium" style={{ color: '#f59e0b' }}>
                Paused
              </span>
            </div>
          )}

          {/* Replay progress */}
          {isReplaying && (
            <div
              className="absolute bottom-20 left-1/2 -translate-x-1/2 pointer-events-none flex items-center gap-3 px-4 py-2 rounded-full"
              style={{
                background: 'rgba(34,197,94,0.15)',
                border: '1px solid rgba(34,197,94,0.3)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <span className="text-sm" style={{ color: '#22c55e' }}>
                Replaying {replayIndex + 1}/{actions.length}
              </span>
              <div
                className="w-32 h-1.5 rounded-full overflow-hidden"
                style={{ background: 'rgba(34,197,94,0.2)' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    background: '#22c55e',
                    width: `${((replayIndex + 1) / actions.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Controls Panel (always accessible) */}
      <div
        className="fixed bottom-4 right-4 z-50 pointer-events-auto"
        style={{ width: 340 }}
      >
        {/* Main control panel */}
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: 'rgba(15,15,20,0.9)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">🖥️</span>
              <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>
                Computer Use
              </span>
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{
                  background: state === 'recording' ? 'rgba(239,68,68,0.2)' :
                    state === 'paused' ? 'rgba(245,158,11,0.2)' :
                    state === 'showing' ? 'rgba(34,197,94,0.2)' :
                    'rgba(107,114,128,0.2)',
                  color: state === 'recording' ? '#ef4444' :
                    state === 'paused' ? '#f59e0b' :
                    state === 'showing' ? '#22c55e' :
                    '#6b7280',
                }}
              >
                {state}
              </span>
            </div>
            <button
              onClick={isVisible ? handleHide : handleShow}
              className="p-1 rounded transition-colors"
              style={{ color: 'rgba(255,255,255,0.5)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.9)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isVisible ? (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
            </button>
          </div>

          {/* Controls */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 mb-3">
              {state === 'hidden' || state === 'showing' ? (
                <button
                  onClick={handleStartRecording}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background: 'rgba(239,68,68,0.15)',
                    color: '#ef4444',
                    border: '1px solid rgba(239,68,68,0.2)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.25)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
                >
                  <div className="w-2 h-2 rounded-full" style={{ background: '#ef4444' }} />
                  Record
                </button>
              ) : state === 'recording' ? (
                <>
                  <button
                    onClick={handlePause}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
                    style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}
                  >
                    ⏸ Pause
                  </button>
                  <button
                    onClick={handleStopRecording}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
                    style={{ background: 'rgba(107,114,128,0.15)', color: '#9ca3af', border: '1px solid rgba(107,114,128,0.2)' }}
                  >
                    ⏹ Stop
                  </button>
                </>
              ) : (
                /* paused */
                <>
                  <button
                    onClick={handleResume}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
                    style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
                  >
                    ▶ Resume
                  </button>
                  <button
                    onClick={handleStopRecording}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
                    style={{ background: 'rgba(107,114,128,0.15)', color: '#9ca3af', border: '1px solid rgba(107,114,128,0.2)' }}
                  >
                    ⏹ Stop
                  </button>
                </>
              )}
            </div>

            {/* Secondary controls */}
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={handleScreenshot}
                className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                📸 Screenshot
              </button>

              {!isReplaying && actions.length > 0 && (
                <button
                  onClick={handleReplay}
                  className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.15)' }}
                >
                  ▶ Replay ({actions.length})
                </button>
              )}

              {isReplaying && (
                <button
                  onClick={handleAbortReplay}
                  className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}
                >
                  ⏹ Stop Replay
                </button>
              )}

              <button
                onClick={() => setShowActionLog(!showActionLog)}
                className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium ml-auto"
                style={{
                  background: showActionLog ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
                  color: showActionLog ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                📋 Log
              </button>
            </div>

            {/* Transparency slider */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Transparency</span>
                <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {Math.round(transparency * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={transparency}
                onChange={(e) => handleTransparencyChange(parseFloat(e.target.value))}
                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.3) ${transparency * 100}%, rgba(255,255,255,0.08) ${transparency * 100}%, rgba(255,255,255,0.08) 100%)`,
                }}
              />
            </div>

            {/* Replay speed */}
            {actions.length > 0 && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Speed:</span>
                {[0.5, 1, 2].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setReplaySpeed(speed)}
                    className="px-2 py-0.5 rounded text-xs font-medium"
                    style={{
                      background: replaySpeed === speed ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                      color: replaySpeed === speed ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
                      border: `1px solid ${replaySpeed === speed ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action Log */}
          {showActionLog && (
            <div
              className="border-t max-h-48 overflow-y-auto"
              style={{ borderColor: 'rgba(255,255,255,0.06)' }}
            >
              {actions.length > 0 ? (
                <div className="py-1">
                  {[...actions].reverse().map((action, idx) => (
                    <div
                      key={action.id}
                      className="flex items-center gap-2 px-4 py-1.5"
                      style={{
                        background: isReplaying && replayIndex === actions.length - 1 - idx
                          ? 'rgba(34,197,94,0.1)'
                          : 'transparent',
                      }}
                    >
                      <span className="text-xs flex-shrink-0">{getActionIcon(action.type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-xs font-medium capitalize"
                            style={{ color: getActionColor(action.type) }}
                          >
                            {action.type}
                          </span>
                          {action.coordinates && (
                            <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>
                              ({action.coordinates.x}, {action.coordinates.y})
                            </span>
                          )}
                          {action.text && (
                            <span className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>
                              {action.text.length > 20 ? action.text.slice(0, 20) + '...' : action.text}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs flex-shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }}>
                        {new Date(action.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    No actions recorded yet
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmation && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
        >
          <div
            className="rounded-xl p-6 max-w-md w-full mx-4"
            style={{
              background: 'rgba(15,15,20,0.95)',
              border: '1px solid rgba(239,68,68,0.3)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.15)' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.95)' }}>
                  Potentially Destructive Action
                </h3>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {confirmation.reason}
                </p>
              </div>
            </div>

            <div
              className="p-3 rounded-lg mb-4"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span>{getActionIcon(confirmation.action.type)}</span>
                <span className="text-sm font-medium capitalize" style={{ color: getActionColor(confirmation.action.type) }}>
                  {confirmation.action.type}
                </span>
              </div>
              {confirmation.action.text && (
                <p className="text-sm font-mono" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {confirmation.action.text}
                </p>
              )}
              {confirmation.action.coordinates && (
                <p className="text-xs font-mono mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  at ({confirmation.action.coordinates.x}, {confirmation.action.coordinates.y})
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => handleConfirmAction(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmAction(true)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{
                  background: 'rgba(239,68,68,0.2)',
                  color: '#ef4444',
                  border: '1px solid rgba(239,68,68,0.3)',
                }}
              >
                Approve Action
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot Viewer */}
      {showScreenshot && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setShowScreenshot(false)}
        >
          <div
            className="rounded-xl overflow-hidden max-w-4xl max-h-[80vh] mx-4"
            style={{ border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ background: 'rgba(15,15,20,0.95)' }}
            >
              <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>
                📸 Screenshot
              </span>
              <button
                onClick={() => setShowScreenshot(false)}
                className="p-1 rounded"
                style={{ color: 'rgba(255,255,255,0.5)' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="bg-black flex items-center justify-center" style={{ minHeight: 300 }}>
              {screenshotUrl ? (
                <img src={screenshotUrl} alt="Screenshot" className="max-w-full max-h-[70vh] object-contain" />
              ) : (
                <div className="text-center py-12">
                  <span className="text-4xl">📸</span>
                  <p className="text-sm mt-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Screenshot captured (preview unavailable in demo mode)
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ComputerUseOverlay;
