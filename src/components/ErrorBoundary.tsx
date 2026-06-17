/**
 * OpenAgent-Desktop - Error Boundary
 *
 * Catches uncaught render errors in the major view subtree and shows a
 * recoverable error screen instead of blank-screening the whole app.
 * Previously there was no ErrorBoundary anywhere in src/, so any single
 * render error in any view crashed the entire application.
 */

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional label for the boundary (used in the error UI). */
  label?: string;
  /** Optional callback invoked when the user clicks "Reload". */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', this.props.label ?? 'view', error, errorInfo);
    this.setState({ errorInfo });
    // Optionally report to main process for the crash log.
    try {
      const api = (window as unknown as { openagent?: { app?: { reportError?: (e: Error) => void } } }).openagent;
      api?.app?.reportError?.(error);
    } catch {
      // swallow — never let error reporting crash the boundary
    }
  }

  handleReload = (): void => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    this.props.onReset?.();
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    const label = this.props.label ?? 'This view';
    const err = this.state.error;

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '32px',
          color: 'var(--color-text-primary, #1a1a1a)',
          background: 'var(--color-bg-primary, #fff)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center',
        }}
      >
        <div style={{ marginBottom: '16px', fontSize: '48px' }} aria-hidden>⚠️</div>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 600 }}>
          {label} failed to render
        </h2>
        <p style={{ margin: '0 0 16px 0', color: 'var(--color-text-secondary, #666)', fontSize: '14px' }}>
          An unexpected error occurred. Reloading the view may resolve it.
        </p>
        {err && (
          <pre
            style={{
              background: 'var(--color-bg-tertiary, #f5f5f5)',
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '12px',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              maxWidth: '640px',
              overflow: 'auto',
              textAlign: 'left',
              border: '1px solid var(--color-border-primary, #e5e5e5)',
              margin: '0 0 16px 0',
            }}
          >
            {err.name}: {err.message}
            {this.state.errorInfo?.componentStack ? '\n\nComponent stack:' + this.state.errorInfo.componentStack : ''}
          </pre>
        )}
        <button
          onClick={this.handleReload}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid var(--color-border-primary, #e5e5e5)',
            background: 'var(--color-accent, #6366f1)',
            color: 'white',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          Reload view
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
