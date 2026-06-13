/**
 * OpenAgent-Desktop - Execution Clock
 * 
 * Real-time timer showing how long the agent has been running.
 * Like OpenCowork's execution clock display.
 */

import React, { useState, useEffect } from 'react';

interface ExecutionContextProps {
  startAt: string | null;
  endAt: string | null;
  isRunning: boolean;
}

const ExecutionContext: React.FC<ExecutionContextProps> = ({ startAt, endAt, isRunning }) => {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!startAt) {
      setElapsed('');
      return;
    }

    const update = () => {
      const start = new Date(startAt).getTime();
      const end = endAt ? new Date(endAt).getTime() : Date.now();
      const diffMs = end - start;
      const seconds = Math.floor(diffMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      if (hours > 0) {
        setElapsed(`${hours}h ${minutes % 60}m ${seconds % 60}s`);
      } else if (minutes > 0) {
        setElapsed(`${minutes}m ${seconds % 60}s`);
      } else {
        setElapsed(`${seconds}s`);
      }
    };

    update();

    if (isRunning && !endAt) {
      const interval = setInterval(update, 1000);
      return () => clearInterval(interval);
    }
  }, [startAt, endAt, isRunning]);

  if (!startAt) return null;

  return (
    <div className="flex items-center gap-2">
      {isRunning && !endAt && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
      )}
      <span
        className="text-xs font-mono tabular-nums"
        style={{ color: isRunning && !endAt ? '#22c55e' : 'var(--color-text-tertiary)' }}
      >
        {elapsed}
      </span>
    </div>
  );
};

export default ExecutionContext;
