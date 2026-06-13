/**
 * Typed accessor for the Electron IPC API exposed on the window object.
 * Replaces unsafe (window as any).openagent usage throughout the codebase.
 */

// Import the full API type from types
type ElectronAPI = Window['openagent'];

export function getAPI(): ElectronAPI {
  return (window as unknown as { openagent?: ElectronAPI }).openagent;
}

/** Check if the API is available (i.e., running in Electron) */
export function isElectron(): boolean {
  return !!(window as unknown as { openagent?: unknown }).openagent;
}
