/**
 * Type declarations for the bundled OpenCode server module.
 * This module is resolved at runtime via Vite bundling.
 */
export class Server {
  static listen(config: {
    port: number;
    hostname: string;
    username: string;
    password: string;
    cors: string[];
  }): Promise<void>;
  static close(): Promise<void>;
}
