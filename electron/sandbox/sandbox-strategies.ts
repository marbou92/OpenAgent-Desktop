/**
 * OpenAgent-Desktop - Sandbox Strategies
 *
 * OS-specific sandbox creation and management strategies:
 * - WSL2 (Windows 10+)
 * - Lima (macOS)
 * - Docker (Linux)
 * - Basic (Windows 7 fallback / no VM support)
 */

import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ─── Type Definitions ─────────────────────────────────────────────────────────

export interface SandboxConfig {
  cpuLimit?: number; // percentage (0-100)
  memoryLimitMB?: number;
  diskLimitMB?: number;
  networkIsolation?: boolean;
  allowedPaths?: string[];
  deniedPaths?: string[];
  env?: Record<string, string>;
  autoRestart?: boolean;
  healthCheckIntervalMs?: number;
}

export interface ExecuteOptions {
  cwd?: string;
  timeout?: number; // milliseconds
  env?: Record<string, string>;
  stdin?: string;
}

export interface ExecuteResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  timedOut: boolean;
}

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  permissions: string;
}

export interface SandboxStatus {
  running: boolean;
  type: SandboxType;
  startedAt?: string;
  health: "healthy" | "degraded" | "unhealthy" | "stopped";
  resourceUsage: ResourceUsage;
  config: SandboxConfig;
}

export interface ResourceUsage {
  cpuPercent: number;
  memoryUsedMB: number;
  memoryLimitMB: number;
  diskUsedMB: number;
  diskLimitMB: number;
}

export type SandboxType = "wsl2" | "lima" | "docker" | "basic" | "unknown";

export interface SandboxInterface {
  start(config: SandboxConfig): Promise<void>;
  stop(): Promise<void>;
  execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult>;
  getStatus(): SandboxStatus;
  getFile(filePath: string): Promise<Buffer>;
  putFile(filePath: string, content: Buffer): Promise<void>;
  listFiles(dir: string): Promise<FileInfo[]>;
}

// ─── WSL2 Sandbox Implementation ──────────────────────────────────────────────

class WSL2Sandbox implements SandboxInterface {
  private running = false;
  private startedAt?: string;
  private distroName = "openagent-sandbox";
  private config: SandboxConfig = {};
  private resourceUsage: ResourceUsage = {
    cpuPercent: 0,
    memoryUsedMB: 0,
    memoryLimitMB: 2048,
    diskUsedMB: 0,
    diskLimitMB: 5120,
  };
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private sandboxDir: string;

  constructor(sandboxDir: string) {
    this.sandboxDir = sandboxDir;
  }

  async start(config: SandboxConfig): Promise<void> {
    this.config = config;
    this.resourceUsage.memoryLimitMB = config.memoryLimitMB || 2048;
    this.resourceUsage.diskLimitMB = config.diskLimitMB || 5120;

    // Check if WSL2 is available
    const wslCheck = this.execSync("wsl --list --quiet 2>nul");
    if (wslCheck.exitCode !== 0) {
      throw new Error("WSL2 is not available. Please install WSL2 first.");
    }

    // Check if our distro already exists
    const distroList = wslCheck.stdout.split("\n").map((d) => d.trim());
    const distroExists = distroList.includes(this.distroName);

    if (!distroExists) {
      const rootfsPath = path.join(this.sandboxDir, "rootfs");
      if (!fs.existsSync(rootfsPath)) {
        fs.mkdirSync(rootfsPath, { recursive: true });
      }

      const tarPath = path.join(this.sandboxDir, "rootfs.tar.gz");
      if (!fs.existsSync(tarPath)) {
        console.info("[WSL2] Using default WSL distribution for sandbox");
      }

      try {
        if (fs.existsSync(tarPath)) {
          this.execSync(
            `wsl --import ${this.distroName} "${rootfsPath}" "${tarPath}"`
          );
        } else {
          this.distroName = "Ubuntu";
        }
      } catch (err) {
        console.warn("[WSL2] Failed to import distro, using default:", err);
        this.distroName = "Ubuntu";
      }
    }

    // Configure resource limits via .wslconfig
    const wslConfigPath = path.join(os.homedir(), ".wslconfig");
    const wslConfig = `[wsl2]
memory=${config.memoryLimitMB || 2048}MB
processors=${Math.ceil((config.cpuLimit || 100) / 25)}
swap=0
localhostForwarding=true
`;
    fs.writeFileSync(wslConfigPath, wslConfig, "utf-8");

    // Set up network isolation if requested
    if (config.networkIsolation) {
      try {
        this.execSync(
          `wsl -d ${this.distroName} -- bash -c "iptables -P OUTPUT DROP && iptables -A OUTPUT -o lo -j ACCEPT"`
        );
      } catch (err) {
        console.warn("[WSL2] Failed to set up network isolation:", err);
      }
    }

    // Set up filesystem access controls
    await this.setupFilesystemAccess(config);

    this.running = true;
    this.startedAt = new Date().toISOString();

    // Start health monitoring
    this.startHealthMonitoring();
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.stopHealthMonitoring();
    try {
      this.execSync(`wsl --terminate ${this.distroName}`);
    } catch (err) {
      console.warn("[WSL2] Error stopping sandbox:", err);
    }
    this.running = false;
    this.startedAt = undefined;
  }

  async execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    if (!this.running) {
      throw new Error("Sandbox is not running");
    }

    const cwd = options?.cwd ? `--cd "${options.cwd}"` : "";
    const timeout = options?.timeout || 30000;

    let envPrefix = "";
    if (options?.env) {
      for (const [key, value] of Object.entries(options.env)) {
        envPrefix += `${key}="${value.replace(/"/g, '\\"')}" `;
      }
    }

    let stdinArg = "";
    if (options?.stdin) {
      const tmpFile = path.join(this.sandboxDir, `stdin-${Date.now()}.tmp`);
      fs.writeFileSync(tmpFile, options.stdin, "utf-8");
      stdinArg = `< "${tmpFile}"`;
    }

    const wrappedCommand = `${envPrefix}${command} ${stdinArg}`;
    const startTime = Date.now();

    try {
      const result = this.execSyncWithTimeout(
        `wsl -d ${this.distroName} ${cwd} -- bash -c "${wrappedCommand.replace(/"/g, '\\"')}"`,
        timeout
      );

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: Date.now() - startTime,
        timedOut: false,
      };
    } catch (err: any) {
      if (err.timedOut) {
        return {
          exitCode: -1,
          stdout: err.stdout || "",
          stderr: err.stderr || "Command timed out",
          duration: Date.now() - startTime,
          timedOut: true,
        };
      }
      throw err;
    }
  }

  getStatus(): SandboxStatus {
    return {
      running: this.running,
      type: "wsl2",
      startedAt: this.startedAt,
      health: this.running ? "healthy" : "stopped",
      resourceUsage: { ...this.resourceUsage },
      config: { ...this.config },
    };
  }

  async getFile(filePath: string): Promise<Buffer> {
    const result = await this.execute(`cat "${filePath}"`, { timeout: 10000 });
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file: ${result.stderr}`);
    }
    return Buffer.from(result.stdout, "binary");
  }

  async putFile(filePath: string, content: Buffer): Promise<void> {
    const tmpFile = path.join(this.sandboxDir, `upload-${Date.now()}.tmp`);
    fs.writeFileSync(tmpFile, content);

    try {
      const result = await this.execute(
        `cp "/mnt/host/${tmpFile}" "${filePath}"`,
        { timeout: 10000 }
      );
      if (result.exitCode !== 0) {
        throw new Error(`Failed to write file: ${result.stderr}`);
      }
    } finally {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
  }

  async listFiles(dir: string): Promise<FileInfo[]> {
    const result = await this.execute(
      `ls -la "${dir}" 2>/dev/null && echo "---" && stat -c '%n|%s|%Y|%a' "${dir}"/* 2>/dev/null`,
      { timeout: 10000 }
    );

    if (result.exitCode !== 0) {
      return [];
    }

    return this.parseLsOutput(result.stdout, dir);
  }

  private async setupFilesystemAccess(config: SandboxConfig): Promise<void> {
    if (config.allowedPaths && config.allowedPaths.length > 0) {
      for (const allowedPath of config.allowedPaths) {
        const mountPoint = `/mnt/host${allowedPath.replace(/\\/g, "/").replace(":", "")}`;
        try {
          await this.execute(`mkdir -p "${mountPoint}"`, { timeout: 5000 });
        } catch {
          // Directory may already exist
        }
      }
    }
  }

  private startHealthMonitoring(): void {
    const interval = this.config.healthCheckIntervalMs || 30000;
    this.healthCheckTimer = setInterval(async () => {
      try {
        const result = await this.execute("echo health-check", {
          timeout: 5000,
        });
        if (result.exitCode !== 0) {
          this.updateHealth("degraded");
        } else {
          await this.updateResourceUsage();
          this.updateHealth("healthy");
        }
      } catch {
        this.updateHealth("unhealthy");
      }
    }, interval);
  }

  private stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  private updateHealth(_health: "healthy" | "degraded" | "unhealthy"): void {
    // Health is reflected in getStatus()
  }

  private async updateResourceUsage(): Promise<void> {
    try {
      const memResult = await this.execute(
        "cat /proc/meminfo | head -2",
        { timeout: 5000 }
      );
      if (memResult.exitCode === 0) {
        const lines = memResult.stdout.split("\n");
        const memTotal = parseInt(lines[0]?.replace(/\D/g, "") || "0") / 1024;
        const memAvailable = parseInt(lines[1]?.replace(/\D/g, "") || "0") / 1024;
        this.resourceUsage.memoryUsedMB = Math.round(memTotal - memAvailable);
      }

      const diskResult = await this.execute("df -h / | tail -1", {
        timeout: 5000,
      });
      if (diskResult.exitCode === 0) {
        const parts = diskResult.stdout.trim().split(/\s+/);
        if (parts.length >= 3) {
          this.resourceUsage.diskUsedMB = Math.round(
            parseFloat(parts[2].replace("G", "")) * 1024 ||
            parseFloat(parts[2].replace("M", "")) ||
            0
          );
        }
      }

      const cpuResult = await this.execute(
        "grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage}'",
        { timeout: 5000 }
      );
      if (cpuResult.exitCode === 0) {
        this.resourceUsage.cpuPercent = Math.round(
          parseFloat(cpuResult.stdout.trim()) || 0
        );
      }
    } catch {
      // Non-critical, use last known values
    }
  }

  private execSync(command: string): { exitCode: number; stdout: string; stderr: string } {
    try {
      const result = child_process.execSync(command, {
        encoding: "utf-8",
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      });
      return { exitCode: 0, stdout: result, stderr: "" };
    } catch (err: any) {
      return {
        exitCode: err.status || 1,
        stdout: err.stdout || "",
        stderr: err.stderr || err.message || "",
      };
    }
  }

  private execSyncWithTimeout(
    command: string,
    timeout: number
  ): { exitCode: number; stdout: string; stderr: string; timedOut?: boolean } {
    try {
      const result = child_process.execSync(command, {
        encoding: "utf-8",
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      });
      return { exitCode: 0, stdout: result, stderr: "" };
    } catch (err: any) {
      if (err.killed) {
        return {
          exitCode: -1,
          stdout: err.stdout || "",
          stderr: "Command timed out",
          timedOut: true,
        };
      }
      return {
        exitCode: err.status || 1,
        stdout: err.stdout || "",
        stderr: err.stderr || err.message || "",
      };
    }
  }

  private parseLsOutput(output: string, baseDir: string): FileInfo[] {
    const lines = output.split("\n");
    const files: FileInfo[] = [];

    for (const line of lines) {
      const match = line.match(
        /^([drwx-]{10})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(.+?)\s+(.+)$/
      );
      if (match) {
        const [, perms, size, , name] = match;
        if (name === "." || name === "..") continue;

        files.push({
          name,
          path: path.join(baseDir, name),
          isDirectory: perms.startsWith("d"),
          size: parseInt(size, 10),
          modifiedAt: new Date().toISOString(),
          permissions: perms,
        });
      }
    }

    return files;
  }
}

// ─── Lima Sandbox Implementation (macOS) ──────────────────────────────────────

class LimaSandbox implements SandboxInterface {
  private running = false;
  private startedAt?: string;
  private instanceName = "openagent-sandbox";
  private config: SandboxConfig = {};
  private resourceUsage: ResourceUsage = {
    cpuPercent: 0,
    memoryUsedMB: 0,
    memoryLimitMB: 2048,
    diskUsedMB: 0,
    diskLimitMB: 5120,
  };
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private sandboxDir: string;

  constructor(sandboxDir: string) {
    this.sandboxDir = sandboxDir;
  }

  async start(config: SandboxConfig): Promise<void> {
    this.config = config;
    this.resourceUsage.memoryLimitMB = config.memoryLimitMB || 2048;
    this.resourceUsage.diskLimitMB = config.diskLimitMB || 5120;

    const limaCheck = this.execQuiet("which limactl");
    if (limaCheck.exitCode !== 0) {
      throw new Error(
        "Lima is not installed. Install with: brew install lima"
      );
    }

    const listResult = this.execQuiet("limactl list --json");
    let instanceExists = false;
    if (listResult.exitCode === 0) {
      const instances = listResult.stdout
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      instanceExists = instances.some(
        (i: any) => i.name === this.instanceName
      );
    }

    if (!instanceExists) {
      const limaConfig = this.generateLimaConfig(config);
      const configPath = path.join(this.sandboxDir, "lima-config.yaml");
      fs.writeFileSync(configPath, limaConfig, "utf-8");

      const startResult = this.exec(
        `limactl start --tty=false "${configPath}"`
      );
      if (startResult.exitCode !== 0) {
        throw new Error(`Failed to start Lima instance: ${startResult.stderr}`);
      }
    } else {
      this.execQuiet(`limactl start ${this.instanceName}`);
    }

    if (config.allowedPaths && config.allowedPaths.length > 0) {
      for (const allowedPath of config.allowedPaths) {
        console.info(`[Lima] Allowed path: ${allowedPath}`);
      }
    }

    this.running = true;
    this.startedAt = new Date().toISOString();
    this.startHealthMonitoring();
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.stopHealthMonitoring();
    try {
      this.execQuiet(`limactl stop ${this.instanceName}`);
    } catch (err) {
      console.warn("[Lima] Error stopping sandbox:", err);
    }
    this.running = false;
    this.startedAt = undefined;
  }

  async execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    if (!this.running) {
      throw new Error("Sandbox is not running");
    }

    const cwd = options?.cwd ? `--cwd "${options.cwd}"` : "";
    const timeout = options?.timeout || 30000;

    let envPrefix = "";
    if (options?.env) {
      for (const [key, value] of Object.entries(options.env)) {
        envPrefix += `--env ${key}="${value.replace(/"/g, '\\"')}" `;
      }
    }

    const startTime = Date.now();

    try {
      const result = this.execWithTimeout(
        `limactl shell ${this.instanceName} ${cwd} ${envPrefix} bash -c "${command.replace(/"/g, '\\"')}"`,
        timeout,
        options?.stdin
      );

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: Date.now() - startTime,
        timedOut: false,
      };
    } catch (err: any) {
      if (err.timedOut) {
        return {
          exitCode: -1,
          stdout: err.stdout || "",
          stderr: err.stderr || "Command timed out",
          duration: Date.now() - startTime,
          timedOut: true,
        };
      }
      throw err;
    }
  }

  getStatus(): SandboxStatus {
    return {
      running: this.running,
      type: "lima",
      startedAt: this.startedAt,
      health: this.running ? "healthy" : "stopped",
      resourceUsage: { ...this.resourceUsage },
      config: { ...this.config },
    };
  }

  async getFile(filePath: string): Promise<Buffer> {
    const result = await this.execute(`cat "${filePath}"`, { timeout: 10000 });
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file: ${result.stderr}`);
    }
    return Buffer.from(result.stdout, "utf-8");
  }

  async putFile(filePath: string, content: Buffer): Promise<void> {
    const tmpFile = path.join(this.sandboxDir, `upload-${Date.now()}.tmp`);
    fs.writeFileSync(tmpFile, content);

    try {
      this.execQuiet(
        `limactl copy "${tmpFile}" ${this.instanceName}:"${filePath}"`
      );
    } finally {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
  }

  async listFiles(dir: string): Promise<FileInfo[]> {
    const result = await this.execute(
      `ls -la "${dir}" 2>/dev/null`,
      { timeout: 10000 }
    );

    if (result.exitCode !== 0) {
      return [];
    }

    const files: FileInfo[] = [];
    const lines = result.stdout.split("\n");

    for (const line of lines) {
      const match = line.match(
        /^([drwx-]{10})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\w+\s+\d+\s+[\d:]+\s+(.+)$/
      );
      if (match) {
        const [, perms, size, name] = match;
        if (name === "." || name === "..") continue;

        files.push({
          name,
          path: path.posix.join(dir, name),
          isDirectory: perms.startsWith("d"),
          size: parseInt(size, 10),
          modifiedAt: new Date().toISOString(),
          permissions: perms,
        });
      }
    }

    return files;
  }

  private generateLimaConfig(config: SandboxConfig): string {
    const cpus = Math.ceil((config.cpuLimit || 100) / 25);
    const memory = `${config.memoryLimitMB || 2048}MiB`;
    const disk = `${config.diskLimitMB || 5120}MiB`;

    let mounts = "";
    if (config.allowedPaths && config.allowedPaths.length > 0) {
      mounts = config.allowedPaths
        .map(
          (p) => `
  - location: "${p}"
    writable: true`
        )
        .join("\n");
    } else {
      mounts = `
  - location: "~"
    writable: true
  - location: "/tmp/openagent"
    writable: true`;
    }

    return `# OpenAgent-Desktop Lima sandbox configuration
vmType: qemu
images:
  - location: "https://cloud-images.ubuntu.com/releases/22.04/release/ubuntu-22.04-server-cloudimg-amd64.img"
    arch: "x86_64"
  - location: "https://cloud-images.ubuntu.com/releases/22.04/release/ubuntu-22.04-server-cloudimg-arm64.img"
    arch: "aarch64"
cpus: ${cpus}
memory: ${memory}
disk: ${disk}
mounts:${mounts}
networks:
  - lima: shared
${config.networkIsolation ? "" : "    # Network access enabled"}
containerd:
  system: false
  user: false
ssh:
  localPort: 0
  loadDotSSHPubKeys: false
  forwardAgent: false
`;
  }

  private startHealthMonitoring(): void {
    const interval = this.config.healthCheckIntervalMs || 30000;
    this.healthCheckTimer = setInterval(async () => {
      try {
        const result = await this.execute("echo health-check", {
          timeout: 5000,
        });
        if (result.exitCode !== 0) {
          if (this.config.autoRestart !== false) {
            console.info("[Lima] Sandbox unhealthy, attempting restart...");
            await this.stop();
            await this.start(this.config);
          }
        } else {
          await this.updateResourceUsage();
        }
      } catch {
        // Health check failed
      }
    }, interval);
  }

  private stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  private async updateResourceUsage(): Promise<void> {
    try {
      const memResult = await this.execute("free -m | grep Mem", {
        timeout: 5000,
      });
      if (memResult.exitCode === 0) {
        const parts = memResult.stdout.trim().split(/\s+/);
        if (parts.length >= 3) {
          this.resourceUsage.memoryUsedMB = parseInt(parts[2], 10) || 0;
        }
      }

      const diskResult = await this.execute("df -m / | tail -1", {
        timeout: 5000,
      });
      if (diskResult.exitCode === 0) {
        const parts = diskResult.stdout.trim().split(/\s+/);
        if (parts.length >= 3) {
          this.resourceUsage.diskUsedMB = parseInt(parts[2], 10) || 0;
        }
      }
    } catch {
      // Non-critical
    }
  }

  private execQuiet(
    command: string
  ): { exitCode: number; stdout: string; stderr: string } {
    try {
      const result = child_process.execSync(command, {
        encoding: "utf-8",
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { exitCode: 0, stdout: result, stderr: "" };
    } catch (err: any) {
      return {
        exitCode: err.status || 1,
        stdout: err.stdout || "",
        stderr: err.stderr || "",
      };
    }
  }

  private exec(
    command: string
  ): { exitCode: number; stdout: string; stderr: string } {
    return this.execQuiet(command);
  }

  private execWithTimeout(
    command: string,
    timeout: number,
    stdin?: string
  ): { exitCode: number; stdout: string; stderr: string; timedOut?: boolean } {
    try {
      const result = child_process.execSync(command, {
        encoding: "utf-8",
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        input: stdin,
      });
      return { exitCode: 0, stdout: result, stderr: "" };
    } catch (err: any) {
      if (err.killed) {
        return {
          exitCode: -1,
          stdout: err.stdout || "",
          stderr: "Command timed out",
          timedOut: true,
        };
      }
      return {
        exitCode: err.status || 1,
        stdout: err.stdout || "",
        stderr: err.stderr || err.message || "",
      };
    }
  }
}

// ─── Docker Sandbox Implementation (Linux) ────────────────────────────────────

class DockerSandbox implements SandboxInterface {
  private running = false;
  private startedAt?: string;
  private containerId?: string;
  private config: SandboxConfig = {};
  private resourceUsage: ResourceUsage = {
    cpuPercent: 0,
    memoryUsedMB: 0,
    memoryLimitMB: 2048,
    diskUsedMB: 0,
    diskLimitMB: 5120,
  };
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private sandboxDir: string;

  constructor(sandboxDir: string) {
    this.sandboxDir = sandboxDir;
  }

  async start(config: SandboxConfig): Promise<void> {
    this.config = config;
    this.resourceUsage.memoryLimitMB = config.memoryLimitMB || 2048;
    this.resourceUsage.diskLimitMB = config.diskLimitMB || 5120;

    const dockerCheck = this.execQuiet("docker --version");
    if (dockerCheck.exitCode !== 0) {
      throw new Error(
        "Docker is not installed. Please install Docker first."
      );
    }

    const imageName = "openagent-sandbox:latest";

    const imageCheck = this.execQuiet(`docker images -q ${imageName}`);
    if (imageCheck.stdout.trim() === "") {
      console.info("[Docker] Pulling sandbox image...");
      this.execQuiet("docker pull ubuntu:22.04");
    }

    // Build docker run arguments
    const args: string[] = [
      "docker",
      "run",
      "-d",
      "--name",
      `openagent-sandbox-${Date.now()}`,
      "--init",
    ];

    if (config.memoryLimitMB) {
      args.push("--memory", `${config.memoryLimitMB}m`);
      args.push("--memory-swap", `${config.memoryLimitMB}m`);
    }

    if (config.cpuLimit) {
      const cpuCount = os.cpus().length;
      const cpuPeriod = 100000;
      const cpuQuota = Math.round(
        (config.cpuLimit / 100) * cpuCount * cpuPeriod
      );
      args.push("--cpu-period", cpuPeriod.toString());
      args.push("--cpu-quota", cpuQuota.toString());
    }

    if (config.diskLimitMB) {
      args.push(
        "--storage-opt",
        `size=${config.diskLimitMB}m`
      );
    }

    if (config.networkIsolation) {
      args.push("--network", "none");
    }

    if (config.allowedPaths && config.allowedPaths.length > 0) {
      for (const allowedPath of config.allowedPaths) {
        args.push("-v", `${allowedPath}:${allowedPath}:rw`);
      }
    }

    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        args.push("-e", `${key}=${value}`);
      }
    }

    args.push("-v", `${this.sandboxDir}:/workspace:rw`);
    args.push("-w", "/workspace");
    args.push("ubuntu:22.04");
    args.push("tail", "-f", "/dev/null");

    const runResult = this.execQuiet(args.join(" "));
    if (runResult.exitCode !== 0) {
      throw new Error(`Failed to start Docker container: ${runResult.stderr}`);
    }

    this.containerId = runResult.stdout.trim();

    // Wait for container to be running
    let retries = 0;
    while (retries < 30) {
      const inspectResult = this.execQuiet(
        `docker inspect --format='{{.State.Running}}' ${this.containerId}`
      );
      if (inspectResult.stdout.trim() === "true") {
        break;
      }
      await this.sleep(1000);
      retries++;
    }

    // Install basic tools in the container
    this.execQuiet(
      `docker exec ${this.containerId} bash -c "apt-get update && apt-get install -y curl wget git python3 nodejs 2>/dev/null || true"`
    );

    this.running = true;
    this.startedAt = new Date().toISOString();
    this.startHealthMonitoring();
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.stopHealthMonitoring();
    if (this.containerId) {
      try {
        this.execQuiet(`docker stop ${this.containerId}`);
        this.execQuiet(`docker rm ${this.containerId}`);
      } catch (err) {
        console.warn("[Docker] Error stopping container:", err);
      }
      this.containerId = undefined;
    }
    this.running = false;
    this.startedAt = undefined;
  }

  async execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    if (!this.running || !this.containerId) {
      throw new Error("Sandbox is not running");
    }

    const timeout = options?.timeout || 30000;
    const startTime = Date.now();

    const dockerArgs = [`docker`, `exec`, `-i`];

    if (options?.cwd) {
      dockerArgs.push("-w", options.cwd);
    }

    if (options?.env) {
      for (const [key, value] of Object.entries(options.env)) {
        dockerArgs.push("-e", `${key}=${value}`);
      }
    }

    dockerArgs.push(this.containerId);
    dockerArgs.push("bash", "-c", command);

    try {
      const result = child_process.execSync(dockerArgs.join(" "), {
        encoding: "utf-8",
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        input: options?.stdin,
      });

      return {
        exitCode: 0,
        stdout: result,
        stderr: "",
        duration: Date.now() - startTime,
        timedOut: false,
      };
    } catch (err: any) {
      if (err.killed) {
        return {
          exitCode: -1,
          stdout: err.stdout || "",
          stderr: "Command timed out",
          duration: Date.now() - startTime,
          timedOut: true,
        };
      }
      return {
        exitCode: err.status || 1,
        stdout: err.stdout || "",
        stderr: err.stderr || err.message || "",
        duration: Date.now() - startTime,
        timedOut: false,
      };
    }
  }

  getStatus(): SandboxStatus {
    return {
      running: this.running,
      type: "docker",
      startedAt: this.startedAt,
      health: this.running ? "healthy" : "stopped",
      resourceUsage: { ...this.resourceUsage },
      config: { ...this.config },
    };
  }

  async getFile(filePath: string): Promise<Buffer> {
    if (!this.containerId) {
      throw new Error("Sandbox is not running");
    }

    const tmpFile = path.join(this.sandboxDir, `download-${Date.now()}.tmp`);
    this.execQuiet(
      `docker cp ${this.containerId}:${filePath} "${tmpFile}"`
    );

    try {
      const content = fs.readFileSync(tmpFile);
      return content;
    } finally {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
  }

  async putFile(filePath: string, content: Buffer): Promise<void> {
    if (!this.containerId) {
      throw new Error("Sandbox is not running");
    }

    const tmpFile = path.join(this.sandboxDir, `upload-${Date.now()}.tmp`);
    fs.writeFileSync(tmpFile, content);

    try {
      this.execQuiet(
        `docker cp "${tmpFile}" ${this.containerId}:${filePath}`
      );
    } finally {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
  }

  async listFiles(dir: string): Promise<FileInfo[]> {
    const result = await this.execute(`ls -la "${dir}"`, { timeout: 10000 });
    if (result.exitCode !== 0) {
      return [];
    }

    const files: FileInfo[] = [];
    const lines = result.stdout.split("\n");

    for (const line of lines) {
      const match = line.match(
        /^([drwx-]{10})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\w+\s+\d+\s+[\d:]+\s+(.+)$/
      );
      if (match) {
        const [, perms, size, name] = match;
        if (name === "." || name === "..") continue;

        files.push({
          name,
          path: path.posix.join(dir, name),
          isDirectory: perms.startsWith("d"),
          size: parseInt(size, 10),
          modifiedAt: new Date().toISOString(),
          permissions: perms,
        });
      }
    }

    return files;
  }

  private startHealthMonitoring(): void {
    const interval = this.config.healthCheckIntervalMs || 30000;
    this.healthCheckTimer = setInterval(async () => {
      if (!this.containerId) return;

      try {
        const inspectResult = this.execQuiet(
          `docker inspect --format='{{.State.Running}}' ${this.containerId}`
        );

        if (inspectResult.stdout.trim() !== "true") {
          if (this.config.autoRestart !== false) {
            console.info("[Docker] Container stopped, attempting restart...");
            await this.stop();
            await this.start(this.config);
          }
          return;
        }

        // Update resource usage
        const statsResult = this.execQuiet(
          `docker stats ${this.containerId} --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}"`
        );

        if (statsResult.exitCode === 0) {
          const parts = statsResult.stdout.trim().split("|");
          if (parts.length >= 2) {
            this.resourceUsage.cpuPercent = parseFloat(
              parts[0].replace("%", "")
            ) || 0;

            const memParts = parts[1].split("/");
            if (memParts.length >= 1) {
              const usedStr = memParts[0].trim();
              if (usedStr.includes("MiB")) {
                this.resourceUsage.memoryUsedMB = parseFloat(usedStr) || 0;
              } else if (usedStr.includes("GiB")) {
                this.resourceUsage.memoryUsedMB =
                  parseFloat(usedStr) * 1024 || 0;
              }
            }
          }
        }
      } catch {
        // Non-critical
      }
    }, interval);
  }

  private stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  private execQuiet(
    command: string
  ): { exitCode: number; stdout: string; stderr: string } {
    try {
      const result = child_process.execSync(command, {
        encoding: "utf-8",
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { exitCode: 0, stdout: result, stderr: "" };
    } catch (err: any) {
      return {
        exitCode: err.status || 1,
        stdout: err.stdout || "",
        stderr: err.stderr || "",
      };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ─── Basic Sandbox Implementation (Windows 7 fallback) ────────────────────────

class BasicSandbox implements SandboxInterface {
  private running = false;
  private startedAt?: string;
  private config: SandboxConfig = {};
  private resourceUsage: ResourceUsage = {
    cpuPercent: 0,
    memoryUsedMB: 0,
    memoryLimitMB: 2048,
    diskUsedMB: 0,
    diskLimitMB: 5120,
  };
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private sandboxDir: string;
  private workDir: string;

  constructor(sandboxDir: string) {
    this.sandboxDir = sandboxDir;
    this.workDir = path.join(sandboxDir, "workspace");
  }

  async start(config: SandboxConfig): Promise<void> {
    this.config = config;
    this.resourceUsage.memoryLimitMB = config.memoryLimitMB || 2048;
    this.resourceUsage.diskLimitMB = config.diskLimitMB || 5120;

    // Create workspace directory
    if (!fs.existsSync(this.workDir)) {
      fs.mkdirSync(this.workDir, { recursive: true });
    }

    console.warn(
      "[BasicSandbox] Running in basic mode. No true isolation available."
    );
    console.warn(
      "[BasicSandbox] Consider upgrading to Windows 10+ for WSL2 sandbox support."
    );

    // Create a denylist for filesystem access
    const denylistPath = path.join(this.sandboxDir, "denylist.json");
    const defaultDenylist = [
      "C:\\Windows\\System32",
      "C:\\Windows\\SysWOW64",
      "/usr/sbin",
      "/sbin",
      "/etc/passwd",
      "/etc/shadow",
    ];

    if (config.deniedPaths) {
      defaultDenylist.push(...config.deniedPaths);
    }

    fs.writeFileSync(denylistPath, JSON.stringify(defaultDenylist, null, 2));

    this.running = true;
    this.startedAt = new Date().toISOString();
    this.startHealthMonitoring();
  }

  async stop(): Promise<void> {
    this.stopHealthMonitoring();
    this.running = false;
    this.startedAt = undefined;
  }

  async execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    if (!this.running) {
      throw new Error("Sandbox is not running");
    }

    const timeout = options?.timeout || 30000;
    const startTime = Date.now();

    // Validate the command against denied paths
    if (!this.isCommandAllowed(command)) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "Command denied: access to restricted path",
        duration: Date.now() - startTime,
        timedOut: false,
      };
    }

    const execOptions: child_process.ExecSyncOptionsWithStringEncoding = {
      encoding: "utf-8",
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      cwd: options?.cwd || this.workDir,
      env: { ...process.env, ...options?.env, ...this.config.env },
      input: options?.stdin,
    };

    try {
      const result = child_process.execSync(command, execOptions);

      return {
        exitCode: 0,
        stdout: result,
        stderr: "",
        duration: Date.now() - startTime,
        timedOut: false,
      };
    } catch (err: any) {
      if (err.killed) {
        return {
          exitCode: -1,
          stdout: err.stdout || "",
          stderr: "Command timed out",
          duration: Date.now() - startTime,
          timedOut: true,
        };
      }
      return {
        exitCode: err.status || 1,
        stdout: err.stdout || "",
        stderr: err.stderr || err.message || "",
        duration: Date.now() - startTime,
        timedOut: false,
      };
    }
  }

  getStatus(): SandboxStatus {
    return {
      running: this.running,
      type: "basic",
      startedAt: this.startedAt,
      health: this.running ? "healthy" : "stopped",
      resourceUsage: { ...this.resourceUsage },
      config: { ...this.config },
    };
  }

  async getFile(filePath: string): Promise<Buffer> {
    const resolvedPath = this.resolveSandboxPath(filePath);
    if (!resolvedPath) {
      throw new Error(`Access denied: ${filePath}`);
    }
    return fs.readFileSync(resolvedPath);
  }

  async putFile(filePath: string, content: Buffer): Promise<void> {
    const resolvedPath = this.resolveSandboxPath(filePath);
    if (!resolvedPath) {
      throw new Error(`Access denied: ${filePath}`);
    }
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolvedPath, content);
  }

  async listFiles(dir: string): Promise<FileInfo[]> {
    const resolvedDir = this.resolveSandboxPath(dir);
    if (!resolvedDir || !fs.existsSync(resolvedDir)) {
      return [];
    }

    const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
    return entries.map((entry) => {
      const fullPath = path.join(resolvedDir, entry.name);
      const stat = fs.statSync(fullPath);
      return {
        name: entry.name,
        path: path.join(dir, entry.name),
        isDirectory: entry.isDirectory(),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        permissions: stat.mode.toString(8).slice(-3),
      };
    });
  }

  private isCommandAllowed(command: string): boolean {
    const denylistPath = path.join(this.sandboxDir, "denylist.json");
    if (!fs.existsSync(denylistPath)) return true;

    try {
      const denylist: string[] = JSON.parse(
        fs.readFileSync(denylistPath, "utf-8")
      );
      return !denylist.some((denied) =>
        command.toLowerCase().includes(denied.toLowerCase())
      );
    } catch {
      return true;
    }
  }

  private resolveSandboxPath(filePath: string): string | null {
    const resolved = path.resolve(this.workDir, filePath);

    if (!resolved.startsWith(path.resolve(this.workDir))) {
      if (this.config.allowedPaths) {
        const isAllowed = this.config.allowedPaths.some((allowed) =>
          resolved.startsWith(path.resolve(allowed))
        );
        if (isAllowed) return resolved;
      }
      return null;
    }

    return resolved;
  }

  private startHealthMonitoring(): void {
    const interval = this.config.healthCheckIntervalMs || 60000;
    this.healthCheckTimer = setInterval(() => {
      if (!this.running) return;

      if (fs.existsSync(this.workDir)) {
        try {
          const stat = fs.statSync(this.workDir);
          this.resourceUsage.diskUsedMB = Math.round(stat.size / (1024 * 1024));
        } catch {
          // Ignore
        }
      }
    }, interval);
  }

  private stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }
}

// ─── SandboxStrategies ─────────────────────────────────────────────────────────

export class SandboxStrategies {
  private sandboxDir: string;

  constructor(sandboxDir: string) {
    this.sandboxDir = sandboxDir;
  }

  /**
   * Detect the appropriate sandbox type for the current OS
   */
  detectSandboxType(): SandboxType {
    const platform = os.platform();
    const osRelease = os.release();

    if (platform === "win32") {
      const majorVersion = parseInt(osRelease.split(".")[0], 10);
      if (majorVersion >= 10) {
        return "wsl2";
      } else {
        return "basic";
      }
    } else if (platform === "darwin") {
      return "lima";
    } else if (platform === "linux") {
      try {
        child_process.execSync("docker --version", {
          encoding: "utf-8",
          timeout: 5000,
          stdio: "pipe",
        });
        return "docker";
      } catch {
        console.warn(
          "[SandboxStrategies] Docker not available, falling back to basic sandbox"
        );
        return "basic";
      }
    }

    return "basic";
  }

  /**
   * Create a sandbox instance based on the detected type
   */
  createSandbox(type: SandboxType): SandboxInterface {
    switch (type) {
      case "wsl2":
        return new WSL2Sandbox(this.sandboxDir);
      case "lima":
        return new LimaSandbox(this.sandboxDir);
      case "docker":
        return new DockerSandbox(this.sandboxDir);
      case "basic":
        return new BasicSandbox(this.sandboxDir);
      default:
        return new BasicSandbox(this.sandboxDir);
    }
  }
}
