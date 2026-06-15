/**
 * OpenAgent-Desktop Aether - Sidecar Utility Process
 * 
 * This runs in a separate Node.js process via Electron's utilityProcess.fork().
 * It imports and starts the OpenCode server.
 */

import { parentPort } from 'node:worker_threads';

async function startServer(config: {
  hostname: string;
  port: number;
  username: string;
  password: string;
  userDataPath: string;
}): Promise<void> {
  try {
    // Try to import the OpenCode server module
    // This will be resolved at build time by Vite
    let serverModule: any;
    try {
      serverModule = await import('@opencode-ai/server');
    } catch {
      // If the SDK isn't installed, try a local bundled version
      try {
        serverModule = await import('../opencode-server');
      } catch {
        // No server available — signal error
        parentPort?.postMessage({
          type: 'error',
          error: 'OpenCode server module not found',
        });
        return;
      }
    }

    const { Server } = serverModule;
    await Server.listen({
      port: config.port,
      hostname: config.hostname,
      username: config.username,
      password: config.password,
      cors: ['oc://renderer'],
    });

    parentPort?.postMessage({ type: 'ready' });
  } catch (err) {
    parentPort?.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

parentPort?.on('message', async (msg: any) => {
  if (msg?.type === 'start') {
    await startServer(msg);
  }
});
