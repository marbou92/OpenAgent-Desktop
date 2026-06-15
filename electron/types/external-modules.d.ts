/**
 * Type declarations for dynamically-imported modules that may not
 * be available at type-check time but are resolved at runtime.
 */
declare module '@opencode-ai/server' {
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
}

declare module '@opencode-ai/sdk' {
  export class Client {
    constructor(config?: { baseUrl?: string; username?: string; password?: string });
    chat: {
      create(params: { model: string; messages: { role: string; content: string }[]; stream?: boolean }): Promise<any>;
    };
    models: {
      list(): Promise<any[]>;
    };
  }
}
