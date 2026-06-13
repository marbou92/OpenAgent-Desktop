/**
 * OpenAgent-Desktop - Sandbox I/O
 *
 * Handles file I/O operations within the sandbox:
 * - Getting files from the sandbox
 * - Putting files into the sandbox
 * - Listing files and directories
 *
 * Delegates to the appropriate SandboxInterface implementation.
 */

import {
  SandboxInterface,
  SandboxConfig,
  FileInfo,
} from './sandbox-strategies';

export class SandboxIO {
  private getSandbox: () => SandboxInterface | undefined;

  constructor(getSandbox: () => SandboxInterface | undefined) {
    this.getSandbox = getSandbox;
  }

  /**
   * Get a file from the sandbox
   */
  async getFile(filePath: string): Promise<Buffer> {
    const sandbox = this.getSandbox();
    if (!sandbox) {
      throw new Error("Sandbox not initialized");
    }

    const status = sandbox.getStatus();
    if (!status.running) {
      throw new Error("Sandbox is not running");
    }

    return sandbox.getFile(filePath);
  }

  /**
   * Put a file into the sandbox
   */
  async putFile(filePath: string, content: Buffer): Promise<void> {
    const sandbox = this.getSandbox();
    if (!sandbox) {
      throw new Error("Sandbox not initialized");
    }

    const status = sandbox.getStatus();
    if (!status.running) {
      throw new Error("Sandbox is not running");
    }

    return sandbox.putFile(filePath, content);
  }

  /**
   * List files in a directory within the sandbox
   */
  async listFiles(dir: string): Promise<FileInfo[]> {
    const sandbox = this.getSandbox();
    if (!sandbox) {
      throw new Error("Sandbox not initialized");
    }

    const status = sandbox.getStatus();
    if (!status.running) {
      throw new Error("Sandbox is not running");
    }

    return sandbox.listFiles(dir);
  }
}
