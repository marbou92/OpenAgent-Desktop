# OpenAgent-Desktop

<div align="center">

![OpenAgent Desktop](https://img.shields.io/badge/OpenAgent-Desktop-6366f1?style=for-the-badge&logo=electron&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![CI](https://img.shields.io/github/actions/workflow/status/marbou92/OpenAgent-Desktop/ci.yml?style=for-the-badge&branch=main)](https://github.com/marbou92/OpenAgent-Desktop/actions)
[![Downloads](https://img.shields.io/github/downloads/marbou92/OpenAgent-Desktop/total?style=for-the-badge)](https://github.com/marbou92/OpenAgent-Desktop/releases)

**The open-source AI Agent desktop platform — multi-provider LLM access, an extensible skill system, and a configurable sandbox.**

> **Note:** the previously-advertised "35+ providers" / "60+ extensions" / gVisor / 80% coverage / Prettier claims were corrected in this revision to match what the codebase actually ships. See the relevant sections below for the current, accurate counts.

[Download](#installation) · [Documentation](#architecture-overview) · [Providers](#provider-configuration) · [Extensions](#extension-catalog) · [Contributing](#contributing)

</div>

---

## Features

### Multi-Provider Support
The provider system was rewritten in v3 to follow opencode's design. Connect to **12 built-in LLM providers** with a unified interface, plus any OpenAI-compatible custom endpoint:

#### Built-in Providers

| Provider | Auth Methods | Description |
|----------|--------------|-------------|
| OpenAI | API key, OAuth, env var | GPT-4o, GPT-4 Turbo, GPT-3.5, o1, o3 |
| Anthropic | API key, OAuth, env var | Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku |
| Google Gemini | API key, env var | Gemini 2.0 Flash, Gemini 1.5 Pro/Flash |
| Azure OpenAI | API key, Azure AD | Azure-hosted OpenAI models |
| AWS Bedrock | env var (AWS creds) | Claude / Llama / Mistral on Bedrock |
| Google Vertex AI | env var, Azure AD | Gemini + Claude on Vertex AI |
| OpenRouter | API key, env var | 100+ models via OpenRouter |
| Mistral AI | API key, env var | Mistral Large / Medium / Small / Nemo / Codestral |
| Cohere | API key, env var | Command R+ / R / R7B |
| Groq | API key, env var | Llama 3.3 70B, Mixtral 8x7B (fast inference) |
| DeepSeek | API key, env var | DeepSeek Chat / Reasoner |
| Together AI | API key, env var | Llama 3.3 70B, Llama 3.1 405B, Qwen 2.5 72B |

#### Architecture (opencode-style)
- **auth.json** persisted at `userData/auth.json` — all credentials encrypted at rest via Electron `safeStorage` (DPAPI / Keychain / libsecret).
- **Provider registry** — static catalog of the 12 built-ins, plus user-added custom OpenAI-compatible endpoints.
- **Protocol adapters** — per-protocol translators (openai / anthropic / gemini / bedrock / vertex) that normalize the unified `ChatRequest`/`StreamChunk` types.
- **Provider client** — unified entry point; routes to the correct adapter based on the model's qualified id (`<providerId>/<modelId>`).
- **OpenCode sidecar (optional)** — if `@opencode-ai/server` is installed and the sidecar starts successfully, chat calls are routed through it. Otherwise, the in-process provider client handles them directly. Both paths return the same `StreamChunk` shape.
- **Per-session binding** — each session has its own provider+model selection (opencode-style). Switching sessions in the UI changes the active provider without manual re-selection.
- **Model discovery** — hardcoded presets per provider + a "Refresh from provider" button that calls the provider's `/models` endpoint and caches the result.
- **OAuth + Azure AD** — full OAuth 2.0 Authorization Code flow with PKCE for Anthropic and OpenAI; Azure AD (MSAL-equivalent inline PKCE flow) for Azure OpenAI / Vertex. Custom protocol `openagent-desktop://oauth/callback` handles redirects.

### Extensions

The codebase ships a set of built-in extensions under `electron/extensions/builtin/` (e.g. `code-mode`, `developer`, `memory`, `summon`, `computer-controller`, `apps`, `todo`, `top-of-mind`, `chat-recall`, `document-generators`, `auto-visualiser`, `extension-manager`). The hard-coded marketplace catalog (`electron/extensions/marketplace.ts`) lists a larger set of installable MCP-server configs — but actual on-disk extensions are user-installed.

Extend your AI agent with powerful tools and integrations:

#### Code & Development
- **Code Interpreter** — Execute Python, JavaScript, TypeScript, and more in sandboxed environments
- **Code Search** — Search across codebases with semantic understanding
- **Git Operations** — Commit, branch, diff, merge, and resolve conflicts
- **LSP Integration** — Language Server Protocol for diagnostics, completions, and hover info
- **Docker Manager** — Build, run, and manage Docker containers
- **Terminal** — Interactive shell access with command execution
- **File System** — Read, write, search, and manage files and directories
- **Database** — Query and manage SQLite, PostgreSQL, MySQL databases

#### Web & Internet
- **Web Browser** — Navigate, screenshot, extract content from web pages
- **Web Search** — Search the internet with multiple search engines
- **Web Scraper** — Extract structured data from websites
- **API Client** — Make HTTP requests to any REST or GraphQL API
- **RSS Reader** — Subscribe to and read RSS/Atom feeds

#### Communication
- **Email** — Send and read emails via IMAP/SMTP
- **Slack** — Read and send messages, manage channels
- **Discord** — Interact with Discord servers and channels
- **Microsoft Teams** — Send messages and read channels
- **Telegram** — Send and receive Telegram messages

#### Productivity
- **Calendar** — Manage events and schedules (Google Calendar, Outlook)
- **Todo List** — Create and manage tasks and projects
- **Note Taking** — Create and organize notes (Obsidian, Notion compatible)
- **Pomodoro Timer** — Focus time management
- **Clipboard** — Read and write system clipboard

#### Data & Analytics
- **Chart Generator** — Create visualizations from data (bar, line, pie, scatter)
- **CSV Processor** — Parse, filter, transform CSV data
- **JSON/YAML Tool** — Format, validate, and transform structured data
- **SQL Runner** — Execute SQL queries against connected databases
- **Spreadsheet** — Read and write Excel/Google Sheets

#### Media & Content
- **Image Generator** — Create images with DALL-E, Stable Diffusion, Midjourney
- **Image Analysis** — Analyze and describe images with vision models
- **PDF Reader** — Extract text and metadata from PDF documents
- **Document Converter** — Convert between Markdown, HTML, DOCX, PDF
- **Speech-to-Text** — Transcribe audio with Whisper
- **Text-to-Speech** — Convert text to spoken audio

#### AI & Machine Learning
- **Embeddings** — Generate and search text embeddings
- **RAG Pipeline** — Retrieval-Augmented Generation with vector stores
- **Model Fine-tuning** — Configure and launch fine-tuning jobs
- **Evaluation** — Run benchmarks and evaluate model outputs

#### System & Infrastructure
- **Process Manager** — Monitor and manage system processes
- **Network Tools** — DNS lookup, ping, port scan, HTTP health checks
- **Cron Scheduler** — Schedule recurring tasks and automations
- **Environment Variables** — Read and manage environment configuration
- **Keychain** — Secure credential storage (system keychain integration)
- **Backup** — Create and restore application backups

#### Cloud Services
- **AWS** — Interact with S3, EC2, Lambda, and more
- **Google Cloud** — GCS, BigQuery, Cloud Functions
- **Azure** — Blob Storage, Functions, Cognitive Services

### Sandboxing & Security
- **Isolated Execution** — Optional sandboxing via Docker (Linux), WSL2 (Windows 10+), Lima (macOS), or a `basic` fallback (no true isolation — runs commands directly on the host with an in-memory denylist). gVisor is **not** bundled.
- **Permission System** — Granular control over what each agent can access
- **Audit Log** — Complete log of all agent actions and tool invocations
- **Secrets Vault** — Encrypted storage for API keys and credentials
- **Network Policies** — Restrict outbound network access per agent
- **Resource Limits** — CPU, memory, and time limits for agent operations

### Recipe System
- Pre-built automation recipes for common workflows
- Custom recipe creation with YAML configuration
- Share recipes with the community
- Version-controlled recipe packages

### ACP (Agent Communication Protocol)
- Standardized inter-agent communication
- Multi-agent orchestration and coordination
- Tool use protocol for extensibility
- Streaming support for real-time responses

---

## Screenshots

<div align="center">

| Main Chat Interface | Multi-Provider Settings |
|:---:|:---:|
| ![Main Chat](https://via.placeholder.com/800x500/1e1b4b/a5b4fc?text=Main+Chat+Interface) | ![Settings](https://via.placeholder.com/800x500/1e1b4b/a5b4fc?text=Provider+Settings) |

| Extension Manager | Recipe Builder |
|:---:|:---:|
| ![Extensions](https://via.placeholder.com/800x500/1e1b4b/a5b4fc?text=Extension+Manager) | ![Recipes](https://via.placeholder.com/800x500/1e1b4b/a5b4fc?text=Recipe+Builder) |

</div>

---

## Installation

### Download Pre-built Binaries

Download the latest release for your platform from the [Releases page](https://github.com/marbou92/OpenAgent-Desktop/releases):

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | `.dmg` |
| macOS (Intel) | `.dmg` |
| Windows | `.exe` (NSIS Installer) or `.msi` |
| Windows 7 | `.exe` (Portable, see [Win7 Build](#windows-7-support)) |
| Linux | `.AppImage`, `.deb`, or `.tar.gz` |

### Development Setup

#### Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** 9+ or **yarn** 1.22+
- **Git** 2.40+
- **Docker** (for sandboxed code execution)

#### Clone and Run

```bash
# Clone the repository
git clone https://github.com/marbou92/OpenAgent-Desktop.git
cd openagent-desktop

# Install dependencies
npm install

# Start development server with hot reload
npm run dev
```

The app will open automatically. The renderer dev server runs on `http://localhost:5173` with HMR.

#### Build for Production

```bash
# Build the renderer bundle
npm run build

# Package Electron app for current platform
npm run electron:build

# Package for specific platform
npm run electron:build -- --mac
npm run electron:build -- --win
npm run electron:build -- --linux
```

#### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with Electron |
| `npm run build` | Build renderer for production |
| `npm run lint` | Run ESLint on all source files |
| `npm run typecheck` | Run TypeScript type checking |
| `npm test` | Run test suite |
| `npm run electron:build` | Package Electron app |
| `npm run electron:dev` | Start Electron in dev mode |

### Windows 7 Support

OpenAgent-Desktop provides a legacy build for Windows 7 using Electron 22 (the last version supporting Windows 7). This build is available as a separate download from the releases page, tagged with `-Win7` suffix.

---

## Architecture Overview

```
openagent-desktop/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # Main process entry
│   │   ├── ipc/                 # IPC handlers
│   │   ├── tray.ts              # System tray management
│   │   ├── updater.ts           # Auto-update logic
│   │   └── window.ts            # BrowserWindow management
│   ├── preload/                 # Preload scripts (bridge)
│   │   └── index.ts             # Context bridge API
│   ├── renderer/                # React renderer process
│   │   ├── App.tsx              # Root React component
│   │   ├── components/          # UI components
│   │   │   ├── ui/              # Base UI primitives (shadcn)
│   │   │   ├── chat/            # Chat interface components
│   │   │   ├── provider/        # Provider configuration UI
│   │   │   ├── extension/       # Extension manager UI
│   │   │   └── recipe/          # Recipe builder UI
│   │   ├── hooks/               # Custom React hooks
│   │   ├── stores/              # Zustand state stores
│   │   ├── lib/                 # Utility functions
│   │   └── styles/              # Global styles
│   ├── shared/                  # Shared types and utilities
│   │   ├── types/               # TypeScript type definitions
│   │   └── constants/           # Shared constants
│   └── extensions/              # Built-in extension implementations
│       ├── code-interpreter/
│       ├── web-browser/
│       ├── terminal/
│       └── ...
├── resources/                   # App icons and assets
├── scripts/                     # Build and utility scripts
├── .github/                     # GitHub Actions workflows
├── index.html                   # HTML entry point
├── electron-builder.yml         # Electron Builder config
├── tailwind.config.js           # Tailwind CSS config
├── tsconfig.json                # TypeScript config
├── vite.config.ts               # Vite config
└── package.json                 # Package manifest
```

### Process Architecture

```
┌─────────────────────────────────────────────────┐
│                  Main Process                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ IPC Hub  │  │  Tray    │  │   Updater    │  │
│  │          │  │ Manager  │  │              │  │
│  └────┬─────┘  └──────────┘  └──────────────┘  │
│       │                                         │
│  ┌────▼─────────────────────────────────────┐   │
│  │         Extension Host Process           │   │
│  │  ┌────────┐ ┌────────┐ ┌────────────┐   │   │
│  │  │Sandbox │ │Sandbox │ │  Sandbox   │   │   │
│  │  │  #1    │ │  #2    │ │    #3      │   │   │
│  │  └────────┘ └────────┘ └────────────┘   │   │
│  └──────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────┘
                       │ Context Bridge (preload)
┌──────────────────────▼──────────────────────────┐
│              Renderer Process                    │
│  ┌──────────────────────────────────────────┐   │
│  │              React App                   │   │
│  │  ┌───────┐ ┌────────┐ ┌──────────────┐  │   │
│  │  │ Chat  │ │Settings│ │  Extensions  │  │   │
│  │  │ View  │ │ View   │ │    View      │  │   │
│  │  └───────┘ └────────┘ └──────────────┘  │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

---

## Provider Configuration

### Quick Start

1. Open OpenAgent-Desktop
2. Navigate to **Settings → Providers**
3. Click **Add Provider**
4. Select your provider and enter your API key
5. Start chatting!

### Environment Variables

You can also configure providers via environment variables. Create a `.env` file in the application data directory:

```bash
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_ORG_ID=org-...
OPENAI_BASE_URL=https://api.openai.com/v1

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_BASE_URL=https://api.anthropic.com

# Google
GOOGLE_API_KEY=AIza...
GOOGLE_VERTEX_PROJECT=my-project
GOOGLE_VERTEX_REGION=us-central1

# Azure OpenAI
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://my-resource.openai.azure.com
AZURE_OPENAI_API_VERSION=2024-02-15-preview
AZURE_OPENAI_DEPLOYMENT_NAME=my-deployment

# AWS Bedrock
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1

# Mistral
MISTRAL_API_KEY=...

# Groq
GROQ_API_KEY=gsk_...

# DeepSeek
DEEPSEEK_API_KEY=...

# Together AI
TOGETHER_API_KEY=...

# Fireworks AI
FIREWORKS_API_KEY=...

# OpenRouter
OPENROUTER_API_KEY=sk-or-...

# Hugging Face
HUGGINGFACE_API_KEY=hf_...

# Ollama (local)
OLLAMA_BASE_URL=http://localhost:11434

# LM Studio (local)
LM_STUDIO_BASE_URL=http://localhost:1234/v1

# Local AI
LOCALAI_API_KEY=...
LOCALAI_BASE_URL=http://localhost:8080/v1
```

### Model Configuration

Each provider supports custom model configurations:

```yaml
providers:
  - id: openai
    name: OpenAI
    apiKey: ${OPENAI_API_KEY}
    models:
      - id: gpt-4o
        name: GPT-4o
        contextWindow: 128000
        maxTokens: 4096
        capabilities: [chat, vision, function-calling]
      - id: gpt-4-turbo
        name: GPT-4 Turbo
        contextWindow: 128000
        maxTokens: 4096
        capabilities: [chat, vision, function-calling]
      - id: o1
        name: o1
        contextWindow: 200000
        maxTokens: 100000
        capabilities: [chat, reasoning]
```

---

## Extension Catalog

### Installing Extensions

Extensions can be installed from:
1. **Built-in** — Pre-installed with the application
2. **Marketplace** — Browse and install from the community marketplace
3. **Local** — Load custom extensions from your filesystem
4. **URL** — Install from a Git repository URL

### Extension Manifest

Every extension requires an `extension.json` manifest:

```json
{
  "id": "com.openagent.code-interpreter",
  "name": "Code Interpreter",
  "version": "1.0.0",
  "description": "Execute code in sandboxed environments",
  "author": "OpenAgent Team",
  "category": "development",
  "icon": "code.svg",
  "permissions": [
    "sandbox.execute",
    "filesystem.read",
    "filesystem.write"
  ],
  "runtime": {
    "type": "sandboxed",
    "language": "python",
    "timeout": 30000,
    "memory": "512mb"
  },
  "tools": [
    {
      "name": "execute_code",
      "description": "Execute code in a sandboxed environment",
      "parameters": {
        "type": "object",
        "properties": {
          "code": {
            "type": "string",
            "description": "The code to execute"
          },
          "language": {
            "type": "string",
            "enum": ["python", "javascript", "typescript", "bash"],
            "description": "The programming language"
          }
        },
        "required": ["code", "language"]
      }
    }
  ]
}
```

### Creating Custom Extensions

```typescript
import { Extension, Tool } from '@openagent/desktop-sdk';

export default class MyExtension extends Extension {
  name = 'My Custom Extension';
  version = '1.0.0';

  @Tool({
    name: 'my_tool',
    description: 'A custom tool that does something useful',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'The input to process' },
      },
      required: ['input'],
    },
  })
  async myTool(args: { input: string }): Promise<string> {
    this.logger.info(`Processing: ${args.input}`);
    return `Processed: ${args.input}`;
  }

  async onActivate(): Promise<void> {
    this.logger.info('Extension activated');
  }

  async onDeactivate(): Promise<void> {
    this.logger.info('Extension deactivated');
  }
}
```

---

## Recipe System

Recipes are pre-configured automation workflows that combine providers, extensions, and prompts into reusable templates.

### Recipe Format

```yaml
name: "Code Review Assistant"
version: "1.0.0"
description: "Automated code review with customizable rules"
author: "openagent"

provider:
  id: anthropic
  model: claude-3-5-sonnet-20241022

extensions:
  - id: com.openagent.git-operations
  - id: com.openagent.code-search

steps:
  - name: fetch_diff
    tool: git.diff
    args:
      target: HEAD~1

  - name: review
    prompt: |
      Review the following code changes and provide feedback:
      
      {{fetch_diff.output}}
      
      Focus on:
      - Security vulnerabilities
      - Performance issues
      - Code style and best practices
      - Potential bugs
      
    provider: anthropic
    model: claude-3-5-sonnet-20241022

  - name: post_comment
    tool: git.comment
    args:
      body: "{{review.output}}"

triggers:
  - type: manual
  - type: webhook
    event: pull_request.opened
```

### Using Recipes

1. Open the **Recipes** tab in the sidebar
2. Browse available recipes or import a new one
3. Configure the recipe parameters
4. Click **Run** to execute

### Built-in Recipes

| Recipe | Description |
|--------|-------------|
| Code Review | Automated PR review with configurable rules |
| Documentation Generator | Generate docs from code comments |
| Test Writer | Automatically write unit tests for code |
| Bug Analyzer | Analyze error logs and suggest fixes |
| Data Pipeline | ETL workflow with data transformation |
| Report Generator | Generate reports from data sources |
| Security Scanner | Scan code for security vulnerabilities |
| Performance Profiler | Analyze and optimize code performance |

---

## ACP (Agent Communication Protocol)

ACP is the standardized protocol for inter-agent communication in OpenAgent-Desktop.

### Protocol Overview

```
┌──────────┐    ACP Message    ┌──────────┐
│  Agent A │ ◄──────────────► │  Agent B │
│ (Orchestrator)│              │ (Worker) │
└──────────┘                   └──────────┘
     │                              │
     │ ACP Tool Call                │ ACP Tool Response
     ▼                              ▼
┌──────────┐                   ┌──────────┐
│ Extension│                   │ Extension│
│  Host    │                   │  Host    │
└──────────┘                   └──────────┘
```

### Message Format

```json
{
  "protocol": "acp/1.0",
  "type": "tool_call",
  "id": "msg_abc123",
  "timestamp": "2024-01-15T10:30:00Z",
  "from": {
    "agentId": "orchestrator",
    "sessionId": "sess_xyz789"
  },
  "to": {
    "agentId": "worker-1",
    "sessionId": "sess_xyz789"
  },
  "body": {
    "tool": "execute_code",
    "args": {
      "code": "print('Hello, World!')",
      "language": "python"
    }
  },
  "metadata": {
    "timeout": 30000,
    "priority": "normal",
    "streaming": false
  }
}
```

### Response Format

```json
{
  "protocol": "acp/1.0",
  "type": "tool_response",
  "id": "msg_abc123",
  "timestamp": "2024-01-15T10:30:01Z",
  "from": {
    "agentId": "worker-1",
    "sessionId": "sess_xyz789"
  },
  "to": {
    "agentId": "orchestrator",
    "sessionId": "sess_xyz789"
  },
  "body": {
    "status": "success",
    "result": "Hello, World!\n",
    "executionTime": 120,
    "memoryUsed": "12mb"
  }
}
```

### Streaming Support

For long-running operations, ACP supports streaming responses:

```json
{
  "protocol": "acp/1.0",
  "type": "stream_chunk",
  "id": "msg_abc123",
  "body": {
    "chunkIndex": 1,
    "content": "Processing...",
    "done": false
  }
}
```

### Multi-Agent Orchestration

```yaml
orchestration:
  name: "Research & Summarize"
  agents:
    - id: researcher
      provider: openai
      model: gpt-4o
      role: "Research and gather information"
      
    - id: summarizer
      provider: anthropic
      model: claude-3-5-sonnet-20241022
      role: "Summarize findings"
      
    - id: reviewer
      provider: openai
      model: gpt-4o
      role: "Review summary for accuracy"

  workflow:
    - step: 1
      agent: researcher
      prompt: "Research the latest developments in {topic}"
      output: research_results
      
    - step: 2
      agent: summarizer
      prompt: "Summarize the following research: {research_results}"
      output: summary
      
    - step: 3
      agent: reviewer
      prompt: "Review this summary for accuracy and completeness: {summary}"
      output: final_review
```

---

## Contributing

We welcome contributions from the community! Here's how you can help:

### Getting Started

1. **Fork** the repository
2. **Clone** your fork locally
3. Create a **feature branch** from `main`
4. Make your changes
5. Submit a **Pull Request**

### Development Workflow

```bash
# Create a feature branch
git checkout -b feature/my-new-feature

# Make changes and commit
git add .
git commit -m "feat: add amazing new feature"

# Push to your fork
git push origin feature/my-new-feature

# Open a Pull Request on GitHub
```

### Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

| Type | Description |
|------|-------------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation changes |
| `style:` | Code style changes (formatting, etc.) |
| `refactor:` | Code refactoring |
| `perf:` | Performance improvements |
| `test:` | Test additions or modifications |
| `chore:` | Build process or tooling changes |
| `ci:` | CI/CD changes |

### Code Style

- **TypeScript** strict mode is on; `any` types are permitted by ESLint config (`@typescript-eslint/no-explicit-any: off`) — work to tighten this is in progress.
- **ESLint** for linting. (Prettier is **not** currently configured.)
- **React** functional components with hooks
- **Tailwind CSS** for styling (no inline styles)
- Minimum test coverage targets are aspirational; current line coverage is low (single-digit percent). Contributions that add tests — especially for `electron/permissions`, `electron/sandbox`, `electron/utils/encryption`, and `electron/recipes` — are very welcome.

### Pull Request Process

1. Ensure all CI checks pass (lint, typecheck, test, build)
2. Update documentation for any new features
3. Add entries to the changelog
4. Request review from maintainers
5. Address review feedback

### Reporting Issues

- Use the [GitHub Issue Tracker](https://github.com/marbou92/OpenAgent-Desktop/issues)
- Search existing issues before creating a new one
- Include steps to reproduce, expected behavior, and actual behavior
- Include your OS, app version, and relevant configuration

### Feature Requests

- Open a [Discussion](https://github.com/marbou92/OpenAgent-Desktop/discussions)
- Describe the use case and expected behavior
- Explain why existing features don't meet your needs

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2024-2026 marbou92 and OpenAgent-Desktop Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<div align="center">

**[⬆ Back to Top](#openagent-desktop)**

Made with ❤️ by marbou92 and contributors

</div>
