/**
 * OpenAgent-Desktop - MCP Registry
 *
 * Registry of all MCP-based community extensions. Each entry includes:
 * - name, description, repository URL, command, args, env vars needed
 * - Malware detection: check against known-bad list before installation
 * - Extension allowlist for corporate deployments
 * - Auto-discovery of installed MCP servers
 *
 * Includes configurations for ALL community extensions:
 * agentql, apify, asana, beads, blender, browserbase, chrome_devtools,
 * cloudinary, cognee, container_use, context7, dev_to, elevenlabs,
 * exa_search, excalidraw, fetch, figma, firecrawl, github, gitmcp,
 * goto_human, jetbrains, knowledge_graph_memory, linux_mcp, mongodb,
 * nano_banana, neon, netlify, openmetadata, pdf_reader, playwright,
 * prompts_chat, reddit, rendex, repomix, rube, scholar_sidekick,
 * selenium, skills, square, sugar, supabase, tavily_search, vercel,
 * vmware_aiops, youtube_transcript,
 * filesystem, gitlab, postgres, mysql, sqlite, redis, elasticsearch,
 * docker, brave-search, google-search, bing-search, serper, perplexity,
 * jina-reader, mojito-search, aws, gcp, azure, kubernetes, terraform,
 * pulumi, cloudflare, digitalocean, slack, discord, telegram, email,
 * notion, confluence, jira, linear, trello, stripe, plaid, hubspot,
 * salesforce, zendesk, intercom, analytics, mixpanel, amplitude,
 * datadog, google-drive, google-calendar, google-mail, microsoft-365,
 * dropbox, airtable, miro, lark, zoom, unreal-engine, homeassistant,
 * weather, maps, spotify, twitter, hackernews
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ExtensionType,
  ExtensionCategory,
  CommunityExtensionEntry,
  MalwareCheckResult,
  MalwareFlag,
  Permission,
  PermissionLevel,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Community extension registry
// ─────────────────────────────────────────────────────────────────────────────

const COMMUNITY_EXTENSIONS: CommunityExtensionEntry[] = [
  // ─── AgentQL ─────────────────────────────────────────────────────────────
  {
    type: ExtensionType.AgentQL,
    name: 'AgentQL',
    description: 'Query web pages using natural language selectors. Extract structured data from any webpage.',
    repository: 'https://github.com/agentql/agentql-mcp',
    command: 'npx',
    args: ['-y', '@agentql/mcp-server'],
    requiredEnvVars: ['AGENTQL_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Browser,
    tags: ['web', 'scraping', 'data-extraction', 'automation'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Read web page content via API' }],
    homepage: 'https://agentql.com',
    author: 'AgentQL',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Apify ───────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Apify,
    name: 'Apify',
    description: 'Run Apify Actors for web scraping, data extraction, and automation tasks.',
    repository: 'https://github.com/apify/apify-mcp-server',
    command: 'npx',
    args: ['-y', '@apify/mcp-server'],
    requiredEnvVars: ['APIFY_TOKEN'],
    optionalEnvVars: ['APIFY_PROXY_PASSWORD'],
    category: ExtensionCategory.Browser,
    tags: ['web-scraping', 'automation', 'actors', 'data-extraction'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Execute Apify actors via API' }],
    homepage: 'https://apify.com',
    author: 'Apify',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Asana ───────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Asana,
    name: 'Asana',
    description: 'Manage Asana projects, tasks, sections, and stories.',
    repository: 'https://github.com/anthropics/asana-mcp-server',
    command: 'npx',
    args: ['-y', '@anthropic/asana-mcp-server'],
    requiredEnvVars: ['ASANA_ACCESS_TOKEN'],
    optionalEnvVars: [],
    category: ExtensionCategory.Productivity,
    tags: ['project-management', 'tasks', 'collaboration'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write Asana projects and tasks' }],
    homepage: 'https://asana.com',
    author: 'Anthropic',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Beads ───────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Beads,
    name: 'Beads',
    description: 'AI-powered image and video generation via Beads platform.',
    repository: 'https://github.com/beadsai/beads-mcp',
    command: 'npx',
    args: ['-y', '@beads/mcp-server'],
    requiredEnvVars: ['BEADS_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Media,
    tags: ['image-generation', 'video', 'ai', 'creative'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Generate media via API' }],
    author: 'Beads',
    version: '1.0.0',
    trusted: false,
  },

  // ─── Blender ─────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Blender,
    name: 'Blender',
    description: 'Control Blender 3D modeling software — create scenes, manipulate objects, and render.',
    repository: 'https://github.com/ahujasid/blender-mcp',
    command: 'uvx',
    args: ['blender-mcp'],
    requiredEnvVars: [],
    optionalEnvVars: ['BLENDER_PORT'],
    category: ExtensionCategory.Design,
    tags: ['3d', 'modeling', 'rendering', 'animation'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Create and modify 3D scenes' }],
    homepage: 'https://www.blender.org',
    author: 'Siddharth Ahuja',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Browserbase ─────────────────────────────────────────────────────────
  {
    type: ExtensionType.Browserbase,
    name: 'Browserbase',
    description: 'Cloud browser automation — run Playwright scripts on remote browsers at scale.',
    repository: 'https://github.com/browserbase/mcp-server',
    command: 'npx',
    args: ['-y', '@browserbasehq/mcp-server'],
    requiredEnvVars: ['BROWSERBASE_API_KEY', 'BROWSERBASE_PROJECT_ID'],
    optionalEnvVars: [],
    category: ExtensionCategory.Browser,
    tags: ['browser', 'automation', 'cloud', 'playwright'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Control remote browser sessions' }],
    homepage: 'https://browserbase.com',
    author: 'Browserbase',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Chrome DevTools ─────────────────────────────────────────────────────
  {
    type: ExtensionType.ChromeDevtools,
    name: 'Chrome DevTools',
    description: 'Connect to Chrome DevTools Protocol for browser debugging and automation.',
    repository: 'https://github.com/anthropics/mcp-server-chrome-devtools',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-chrome-devtools'],
    requiredEnvVars: [],
    optionalEnvVars: ['CHROME_REMOTE_DEBUGGING_PORT'],
    category: ExtensionCategory.Browser,
    tags: ['browser', 'devtools', 'debugging', 'chrome'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Control Chrome browser via DevTools Protocol' }],
    author: 'Anthropic',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Cloudinary ──────────────────────────────────────────────────────────
  {
    type: ExtensionType.Cloudinary,
    name: 'Cloudinary',
    description: 'Upload, transform, and manage images and videos via Cloudinary.',
    repository: 'https://github.com/cloudinary/mcp-server-cloudinary',
    command: 'npx',
    args: ['-y', '@cloudinary/mcp-server'],
    requiredEnvVars: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
    optionalEnvVars: [],
    category: ExtensionCategory.Media,
    tags: ['image', 'video', 'cdn', 'transformation', 'upload'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Upload and transform media assets' }],
    homepage: 'https://cloudinary.com',
    author: 'Cloudinary',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Cognee ──────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Cognee,
    name: 'Cognee',
    description: 'Knowledge graph and memory management with AI-powered retrieval.',
    repository: 'https://github.com/cognee-ai/cognee-mcp',
    command: 'pipx',
    args: ['run', 'cognee-mcp'],
    requiredEnvVars: ['COGNEE_API_KEY'],
    optionalEnvVars: ['COGNEE_GRAPHISTRY_KEY'],
    category: ExtensionCategory.Memory,
    tags: ['knowledge-graph', 'memory', 'retrieval', 'ai'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Manage knowledge graph data' }],
    homepage: 'https://cognee.ai',
    author: 'Cognee',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Container Use ───────────────────────────────────────────────────────
  {
    type: ExtensionType.ContainerUse,
    name: 'Container Use',
    description: 'Run code and commands in isolated Docker containers for safe execution.',
    repository: 'https://github.com/anthropics/container-use-mcp',
    command: 'npx',
    args: ['-y', '@anthropic/container-use-mcp'],
    requiredEnvVars: [],
    optionalEnvVars: ['DOCKER_HOST'],
    category: ExtensionCategory.Development,
    tags: ['docker', 'container', 'sandbox', 'isolation'],
    permissions: [{ level: PermissionLevel.Admin, reason: 'Manage Docker containers' }],
    author: 'Anthropic',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Context7 ────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Context7,
    name: 'Context7',
    description: 'Fetch up-to-date documentation and code examples for any library or framework.',
    repository: 'https://github.com/upstash/context7-mcp',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp'],
    requiredEnvVars: [],
    optionalEnvVars: [],
    category: ExtensionCategory.Development,
    tags: ['documentation', 'code-examples', 'context', 'library'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Fetch documentation from external sources' }],
    homepage: 'https://context7.com',
    author: 'Upstash',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Dev.to ──────────────────────────────────────────────────────────────
  {
    type: ExtensionType.DevTo,
    name: 'Dev.to',
    description: 'Read and publish articles on Dev.to platform.',
    repository: 'https://github.com/anthropics/devto-mcp-server',
    command: 'npx',
    args: ['-y', '@anthropic/devto-mcp-server'],
    requiredEnvVars: ['DEV_TO_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Communication,
    tags: ['blogging', 'articles', 'developer-community'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and publish articles' }],
    homepage: 'https://dev.to',
    author: 'Anthropic',
    version: '1.0.0',
    trusted: true,
  },

  // ─── ElevenLabs ──────────────────────────────────────────────────────────
  {
    type: ExtensionType.ElevenLabs,
    name: 'ElevenLabs',
    description: 'Text-to-speech and voice AI via ElevenLabs API.',
    repository: 'https://github.com/elevenlabs/mcp-server',
    command: 'npx',
    args: ['-y', '@elevenlabs/mcp-server'],
    requiredEnvVars: ['ELEVENLABS_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Media,
    tags: ['text-to-speech', 'voice', 'audio', 'ai'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Generate speech via API' }],
    homepage: 'https://elevenlabs.io',
    author: 'ElevenLabs',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Exa Search ──────────────────────────────────────────────────────────
  {
    type: ExtensionType.ExaSearch,
    name: 'Exa Search',
    description: 'AI-powered web search with high-quality results using Exa API.',
    repository: 'https://github.com/exa-labs/exa-mcp-server',
    command: 'npx',
    args: ['-y', '@exa/mcp-server'],
    requiredEnvVars: ['EXA_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Search,
    tags: ['search', 'web', 'ai', 'research'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Search the web via API' }],
    homepage: 'https://exa.ai',
    author: 'Exa Labs',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Excalidraw ──────────────────────────────────────────────────────────
  {
    type: ExtensionType.Excalidraw,
    name: 'Excalidraw',
    description: 'Create hand-drawn style diagrams and wireframes using Excalidraw.',
    repository: 'https://github.com/excalidraw/excalidraw-mcp',
    command: 'npx',
    args: ['-y', '@excalidraw/mcp-server'],
    requiredEnvVars: [],
    optionalEnvVars: [],
    category: ExtensionCategory.Design,
    tags: ['diagram', 'wireframe', 'whiteboard', 'drawing'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Create and edit diagrams' }],
    homepage: 'https://excalidraw.com',
    author: 'Excalidraw',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Fetch ───────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Fetch,
    name: 'Fetch',
    description: 'Fetch web content — retrieve HTML, JSON, or text from any URL.',
    repository: 'https://github.com/modelcontextprotocol/servers',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    requiredEnvVars: [],
    optionalEnvVars: [],
    category: ExtensionCategory.Search,
    tags: ['http', 'web', 'fetch', 'download'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Fetch content from URLs' }],
    homepage: 'https://modelcontextprotocol.io',
    author: 'MCP',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Figma ───────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Figma,
    name: 'Figma',
    description: 'Access Figma designs, components, and files via the Figma API.',
    repository: 'https://github.com/figma/mcp-server-figma',
    command: 'npx',
    args: ['-y', '@figma/mcp-server-figma'],
    requiredEnvVars: ['FIGMA_ACCESS_TOKEN'],
    optionalEnvVars: [],
    category: ExtensionCategory.Design,
    tags: ['design', 'ui', 'ux', 'prototype', 'collaboration'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Read Figma design files' }],
    homepage: 'https://figma.com',
    author: 'Figma',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Firecrawl ───────────────────────────────────────────────────────────
  {
    type: ExtensionType.Firecrawl,
    name: 'Firecrawl',
    description: 'Scrape, crawl, and extract data from websites with Firecrawl.',
    repository: 'https://github.com/mendableai/firecrawl-mcp-server',
    command: 'npx',
    args: ['-y', '@firecrawl/mcp-server'],
    requiredEnvVars: ['FIRECRAWL_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Browser,
    tags: ['web-scraping', 'crawling', 'data-extraction', 'search'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Scrape web content via API' }],
    homepage: 'https://firecrawl.dev',
    author: 'Mendable AI',
    version: '1.0.0',
    trusted: true,
  },

  // ─── GitHub ──────────────────────────────────────────────────────────────
  {
    type: ExtensionType.GitHub,
    name: 'GitHub',
    description: 'Manage GitHub repositories, issues, PRs, actions, and more.',
    repository: 'https://github.com/modelcontextprotocol/servers',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    requiredEnvVars: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    optionalEnvVars: [],
    category: ExtensionCategory.Development,
    tags: ['git', 'github', 'repository', 'ci-cd', 'issues', 'pr'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write GitHub repositories and issues' }],
    homepage: 'https://github.com',
    author: 'MCP',
    version: '1.0.0',
    trusted: true,
  },

  // ─── GitMCP ──────────────────────────────────────────────────────────────
  {
    type: ExtensionType.GitMCP,
    name: 'GitMCP',
    description: 'Enhanced Git operations with intelligent commit messages and workflow automation.',
    repository: 'https://github.com/gitmcp/gitmcp-server',
    command: 'npx',
    args: ['-y', '@gitmcp/server'],
    requiredEnvVars: [],
    optionalEnvVars: ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL'],
    category: ExtensionCategory.Development,
    tags: ['git', 'version-control', 'automation', 'workflow'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Execute git operations' }],
    homepage: 'https://gitmcp.io',
    author: 'GitMCP',
    version: '1.0.0',
    trusted: true,
  },

  // ─── GotoHuman ───────────────────────────────────────────────────────────
  {
    type: ExtensionType.GotoHuman,
    name: 'GotoHuman',
    description: 'Human-in-the-loop review and approval workflows for AI actions.',
    repository: 'https://github.com/gotohuman/gotohuman-mcp-server',
    command: 'npx',
    args: ['-y', '@gotohuman/mcp-server'],
    requiredEnvVars: ['GOTOHUMAN_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Automation,
    tags: ['human-in-the-loop', 'approval', 'review', 'workflow'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Manage human approval workflows' }],
    homepage: 'https://gotohuman.com',
    author: 'GotoHuman',
    version: '1.0.0',
    trusted: true,
  },

  // ─── JetBrains ───────────────────────────────────────────────────────────
  {
    type: ExtensionType.JetBrains,
    name: 'JetBrains',
    description: 'Integrate with JetBrains IDEs — read/write code, run inspections, navigate projects.',
    repository: 'https://github.com/JetBrains/mcp-server-jetbrains',
    command: 'npx',
    args: ['-y', '@jetbrains/mcp-server'],
    requiredEnvVars: [],
    optionalEnvVars: ['JETBRAINS_IDE_PORT'],
    category: ExtensionCategory.Development,
    tags: ['ide', 'jetbrains', 'intellij', 'pycharm', 'webstorm'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Interact with IDE and project files' }],
    homepage: 'https://jetbrains.com',
    author: 'JetBrains',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Knowledge Graph Memory ──────────────────────────────────────────────
  {
    type: ExtensionType.KnowledgeGraphMemory,
    name: 'Knowledge Graph Memory',
    description: 'Persistent knowledge graph with entities and relations for complex memory structures.',
    repository: 'https://github.com/modelcontextprotocol/servers',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-knowledge-graph-memory'],
    requiredEnvVars: [],
    optionalEnvVars: ['MEMORY_FILE_PATH'],
    category: ExtensionCategory.Memory,
    tags: ['knowledge-graph', 'memory', 'entities', 'relations', 'graph'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Create and query knowledge graph' }],
    homepage: 'https://modelcontextprotocol.io',
    author: 'MCP',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Linux MCP ───────────────────────────────────────────────────────────
  {
    type: ExtensionType.LinuxMCP,
    name: 'Linux MCP',
    description: 'Execute Linux system commands and manage system resources.',
    repository: 'https://github.com/linux-mcp/server',
    command: 'npx',
    args: ['-y', '@linux-mcp/server'],
    requiredEnvVars: [],
    optionalEnvVars: [],
    category: ExtensionCategory.System,
    tags: ['linux', 'system', 'commands', 'administration'],
    permissions: [{ level: PermissionLevel.Admin, reason: 'Execute system commands' }],
    version: '1.0.0',
    trusted: false,
  },

  // ─── MongoDB ─────────────────────────────────────────────────────────────
  {
    type: ExtensionType.MongoDB,
    name: 'MongoDB',
    description: 'Query and manage MongoDB databases — collections, documents, and aggregations.',
    repository: 'https://github.com/mongodb-js/mcp-server-mongodb',
    command: 'npx',
    args: ['-y', '@mongodb/mcp-server'],
    requiredEnvVars: ['MONGODB_URI'],
    optionalEnvVars: ['MONGODB_DATABASE'],
    category: ExtensionCategory.Database,
    tags: ['mongodb', 'database', 'nosql', 'query'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write MongoDB data' }],
    homepage: 'https://mongodb.com',
    author: 'MongoDB',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Nano Banana ─────────────────────────────────────────────────────────
  {
    type: ExtensionType.NanoBanana,
    name: 'Nano Banana',
    description: 'AI-powered code review and analysis with automatic suggestions.',
    repository: 'https://github.com/nanobanana/mcp-server',
    command: 'npx',
    args: ['-y', '@nanobanana/mcp-server'],
    requiredEnvVars: ['NANO_BANANA_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Development,
    tags: ['code-review', 'analysis', 'ai', 'quality'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Analyze code via API' }],
    author: 'Nano Banana',
    version: '1.0.0',
    trusted: false,
  },

  // ─── Neon ────────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Neon,
    name: 'Neon',
    description: 'Manage Neon PostgreSQL databases — create branches, run queries, manage projects.',
    repository: 'https://github.com/neondatabase/mcp-server-neon',
    command: 'npx',
    args: ['-y', '@neondatabase/mcp-server-neon'],
    requiredEnvVars: ['NEON_API_KEY'],
    optionalEnvVars: ['NEON_PROJECT_ID'],
    category: ExtensionCategory.Database,
    tags: ['postgresql', 'database', 'serverless', 'branching'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Manage Neon database projects' }],
    homepage: 'https://neon.tech',
    author: 'Neon',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Netlify ─────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Netlify,
    name: 'Netlify',
    description: 'Deploy and manage sites on Netlify — deploys, DNS, functions, and forms.',
    repository: 'https://github.com/netlify/mcp-server-netlify',
    command: 'npx',
    args: ['-y', '@netlify/mcp-server'],
    requiredEnvVars: ['NETLIFY_ACCESS_TOKEN'],
    optionalEnvVars: ['NETLIFY_SITE_ID'],
    category: ExtensionCategory.Cloud,
    tags: ['deployment', 'hosting', 'serverless', 'cdn'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Deploy and manage Netlify sites' }],
    homepage: 'https://netlify.com',
    author: 'Netlify',
    version: '1.0.0',
    trusted: true,
  },

  // ─── OpenMetadata ────────────────────────────────────────────────────────
  {
    type: ExtensionType.OpenMetadata,
    name: 'OpenMetadata',
    description: 'Discover and explore data assets, schemas, and lineage via OpenMetadata.',
    repository: 'https://github.com/open-metadata/mcp-server',
    command: 'pipx',
    args: ['run', 'openmetadata-mcp'],
    requiredEnvVars: ['OPENMETADATA_HOST', 'OPENMETADATA_TOKEN'],
    optionalEnvVars: [],
    category: ExtensionCategory.Data,
    tags: ['metadata', 'data-catalog', 'lineage', 'governance'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Browse data catalog and metadata' }],
    homepage: 'https://open-metadata.org',
    author: 'OpenMetadata',
    version: '1.0.0',
    trusted: true,
  },

  // ─── PDF Reader ──────────────────────────────────────────────────────────
  {
    type: ExtensionType.PdfReader,
    name: 'PDF Reader',
    description: 'Read and extract text, metadata, and structure from PDF files.',
    repository: 'https://github.com/modelcontextprotocol/servers',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    requiredEnvVars: [],
    optionalEnvVars: [],
    category: ExtensionCategory.Productivity,
    tags: ['pdf', 'document', 'reader', 'extraction'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Read PDF files' }],
    homepage: 'https://modelcontextprotocol.io',
    author: 'MCP',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Playwright ──────────────────────────────────────────────────────────
  {
    type: ExtensionType.Playwright,
    name: 'Playwright',
    description: 'Browser automation with Playwright — navigate, interact, screenshot, and extract data.',
    repository: 'https://github.com/anthropics/mcp-server-playwright',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-playwright'],
    requiredEnvVars: [],
    optionalEnvVars: [],
    category: ExtensionCategory.Browser,
    tags: ['browser', 'automation', 'testing', 'playwright', 'e2e'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Automate browser interactions' }],
    homepage: 'https://playwright.dev',
    author: 'Anthropic',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Prompts Chat ────────────────────────────────────────────────────────
  {
    type: ExtensionType.PromptsChat,
    name: 'Prompts Chat',
    description: 'Access and use curated prompt templates for various tasks and domains.',
    repository: 'https://github.com/prompts-chat/mcp-server',
    command: 'npx',
    args: ['-y', '@prompts-chat/mcp-server'],
    requiredEnvVars: [],
    optionalEnvVars: [],
    category: ExtensionCategory.Productivity,
    tags: ['prompts', 'templates', 'chat', 'ai'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Access prompt templates' }],
    author: 'Prompts Chat',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Reddit ──────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Reddit,
    name: 'Reddit',
    description: 'Search and read Reddit posts, comments, and subreddits.',
    repository: 'https://github.com/reddit/mcp-server-reddit',
    command: 'npx',
    args: ['-y', '@reddit/mcp-server'],
    requiredEnvVars: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'],
    optionalEnvVars: ['REDDIT_USER_AGENT'],
    category: ExtensionCategory.Communication,
    tags: ['reddit', 'social', 'forum', 'discussion'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Read Reddit content via API' }],
    homepage: 'https://reddit.com',
    author: 'Reddit',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Rendex ──────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Rendex,
    name: 'Rendex',
    description: 'AI-powered rendering and visualization of data, charts, and reports.',
    repository: 'https://github.com/rendex/mcp-server',
    command: 'npx',
    args: ['-y', '@rendex/mcp-server'],
    requiredEnvVars: ['RENDEX_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Data,
    tags: ['rendering', 'visualization', 'charts', 'reports'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Generate visualizations via API' }],
    author: 'Rendex',
    version: '1.0.0',
    trusted: false,
  },

  // ─── Repomix ─────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Repomix,
    name: 'Repomix',
    description: 'Pack repository code into a single file for AI context — compress and optimize code for LLMs.',
    repository: 'https://github.com/yamadashy/repomix',
    command: 'npx',
    args: ['-y', 'repomix-mcp-server'],
    requiredEnvVars: [],
    optionalEnvVars: [],
    category: ExtensionCategory.Development,
    tags: ['repository', 'code-packing', 'context', 'optimization'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Read repository files' }],
    homepage: 'https://repomix.com',
    author: 'Yamada Shinya',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Rube ────────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Rube,
    name: 'Rube',
    description: 'AI-powered data transformation and ETL pipelines.',
    repository: 'https://github.com/rube-ai/mcp-server',
    command: 'npx',
    args: ['-y', '@rube/mcp-server'],
    requiredEnvVars: ['RUBE_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Data,
    tags: ['etl', 'data-transformation', 'pipeline', 'integration'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Transform and process data' }],
    author: 'Rube AI',
    version: '1.0.0',
    trusted: false,
  },

  // ─── Scholar Sidekick ────────────────────────────────────────────────────
  {
    type: ExtensionType.ScholarSidekick,
    name: 'Scholar Sidekick',
    description: 'Search academic papers and scholarly literature via Semantic Scholar and arXiv.',
    repository: 'https://github.com/scholar-sidekick/mcp-server',
    command: 'npx',
    args: ['-y', '@scholar-sidekick/mcp-server'],
    requiredEnvVars: ['SEMANTIC_SCHOLAR_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Search,
    tags: ['academic', 'papers', 'research', 'scholarly', 'arxiv'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Search academic databases' }],
    homepage: 'https://semanticscholar.org',
    author: 'Scholar Sidekick',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Selenium ────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Selenium,
    name: 'Selenium',
    description: 'Web browser automation with Selenium WebDriver.',
    repository: 'https://github.com/anthropics/mcp-server-selenium',
    command: 'pipx',
    args: ['run', 'mcp-server-selenium'],
    requiredEnvVars: [],
    optionalEnvVars: ['SELENIUM_HUB_URL', 'WEBDRIVER_PATH'],
    category: ExtensionCategory.Browser,
    tags: ['browser', 'automation', 'testing', 'selenium', 'webdriver'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Automate browser via WebDriver' }],
    homepage: 'https://selenium.dev',
    author: 'Anthropic',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Skills ──────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Skills,
    name: 'Skills',
    description: 'Manage and execute reusable skill templates for common AI agent workflows.',
    repository: 'https://github.com/anthropics/skills-mcp-server',
    command: 'npx',
    args: ['-y', '@anthropic/skills-mcp-server'],
    requiredEnvVars: [],
    optionalEnvVars: [],
    category: ExtensionCategory.Automation,
    tags: ['skills', 'templates', 'workflows', 'reusable'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Load and execute skill templates' }],
    author: 'Anthropic',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Square ──────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Square,
    name: 'Square',
    description: 'Manage Square payments, orders, inventory, and customers.',
    repository: 'https://github.com/square/mcp-server-square',
    command: 'npx',
    args: ['-y', '@square/mcp-server'],
    requiredEnvVars: ['SQUARE_ACCESS_TOKEN'],
    optionalEnvVars: ['SQUARE_ENVIRONMENT'],
    category: ExtensionCategory.Productivity,
    tags: ['payments', 'ecommerce', 'orders', 'inventory'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Manage Square business data' }],
    homepage: 'https://squareup.com',
    author: 'Square',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Sugar ───────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Sugar,
    name: 'Sugar',
    description: 'CRM operations via SugarCRM — manage contacts, accounts, and opportunities.',
    repository: 'https://github.com/sugarcrm/mcp-server',
    command: 'npx',
    args: ['-y', '@sugar/mcp-server'],
    requiredEnvVars: ['SUGARCRM_URL', 'SUGARCRM_USERNAME', 'SUGARCRM_PASSWORD'],
    optionalEnvVars: [],
    category: ExtensionCategory.Productivity,
    tags: ['crm', 'contacts', 'sales', 'accounts'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Manage CRM data' }],
    homepage: 'https://sugarcrm.com',
    author: 'SugarCRM',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Supabase ────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Supabase,
    name: 'Supabase',
    description: 'Manage Supabase projects — database queries, auth, storage, and edge functions.',
    repository: 'https://github.com/supabase-community/mcp-server-supabase',
    command: 'npx',
    args: ['-y', '@supabase/mcp-server'],
    requiredEnvVars: ['SUPABASE_ACCESS_TOKEN'],
    optionalEnvVars: ['SUPABASE_PROJECT_REF', 'SUPABASE_DB_URL'],
    category: ExtensionCategory.Database,
    tags: ['supabase', 'postgresql', 'backend', 'auth', 'storage'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Manage Supabase projects and data' }],
    homepage: 'https://supabase.com',
    author: 'Supabase',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Tavily Search ───────────────────────────────────────────────────────
  {
    type: ExtensionType.TavilySearch,
    name: 'Tavily Search',
    description: 'AI-optimized search engine API for accurate, up-to-date results.',
    repository: 'https://github.com/tavily-ai/mcp-server-tavily',
    command: 'npx',
    args: ['-y', '@tavily/mcp-server'],
    requiredEnvVars: ['TAVILY_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Search,
    tags: ['search', 'ai', 'research', 'web'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Search the web via API' }],
    homepage: 'https://tavily.com',
    author: 'Tavily AI',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Vercel ──────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Vercel,
    name: 'Vercel',
    description: 'Deploy and manage projects on Vercel — deployments, domains, and serverless functions.',
    repository: 'https://github.com/vercel/mcp-server-vercel',
    command: 'npx',
    args: ['-y', '@vercel/mcp-server'],
    requiredEnvVars: ['VERCEL_TOKEN'],
    optionalEnvVars: ['VERCEL_TEAM_ID', 'VERCEL_PROJECT_ID'],
    category: ExtensionCategory.Cloud,
    tags: ['deployment', 'hosting', 'serverless', 'nextjs', 'cdn'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Deploy and manage Vercel projects' }],
    homepage: 'https://vercel.com',
    author: 'Vercel',
    version: '1.0.0',
    trusted: true,
  },

  // ─── VMware AIOps ────────────────────────────────────────────────────────
  {
    type: ExtensionType.VMwareAiops,
    name: 'VMware AIOps',
    description: 'VMware AIOps integration for infrastructure monitoring and anomaly detection.',
    repository: 'https://github.com/vmware/mcp-server-aiops',
    command: 'npx',
    args: ['-y', '@vmware/mcp-server-aiops'],
    requiredEnvVars: ['VMWARE_AIOPS_API_KEY', 'VMWARE_AIOPS_URL'],
    optionalEnvVars: [],
    category: ExtensionCategory.System,
    tags: ['vmware', 'monitoring', 'aiops', 'infrastructure', 'anomaly'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Read infrastructure metrics and alerts' }],
    homepage: 'https://vmware.com',
    author: 'VMware',
    version: '1.0.0',
    trusted: true,
  },

  // ─── YouTube Transcript ──────────────────────────────────────────────────
  {
    type: ExtensionType.YouTubeTranscript,
    name: 'YouTube Transcript',
    description: 'Extract transcripts from YouTube videos for content analysis and summarization.',
    repository: 'https://github.com/kimtaeyoon83/mcp-server-youtube-transcript',
    command: 'pipx',
    args: ['run', 'mcp-server-youtube-transcript'],
    requiredEnvVars: [],
    optionalEnvVars: [],
    category: ExtensionCategory.Media,
    tags: ['youtube', 'transcript', 'video', 'subtitles'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Extract video transcripts' }],
    homepage: 'https://youtube.com',
    author: 'Kim Taeyoon',
    version: '1.0.0',
    trusted: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Development Tools
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Filesystem ──────────────────────────────────────────────────────────
  {
    type: ExtensionType.Filesystem,
    name: 'Filesystem',
    description: 'Read, write, and search files and directories on the local filesystem.',
    repository: 'https://github.com/modelcontextprotocol/servers',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    requiredEnvVars: [],
    optionalEnvVars: ['ALLOWED_DIRECTORIES'],
    category: ExtensionCategory.Development,
    tags: ['filesystem', 'files', 'io', 'read', 'write', 'search'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write files on the local filesystem' }],
    homepage: 'https://modelcontextprotocol.io',
    author: 'MCP',
    version: '1.0.0',
    trusted: true,
  },

  // ─── GitLab ──────────────────────────────────────────────────────────────
  {
    type: ExtensionType.GitLab,
    name: 'GitLab',
    description: 'Manage GitLab projects, merge requests, issues, pipelines, and repositories.',
    repository: 'https://github.com/zereight/gitlab-mcp',
    command: 'npx',
    args: ['-y', '@zereight/gitlab-mcp'],
    requiredEnvVars: ['GITLAB_PERSONAL_ACCESS_TOKEN'],
    optionalEnvVars: ['GITLAB_API_URL', 'GITLAB_PROJECT_ID'],
    category: ExtensionCategory.Development,
    tags: ['gitlab', 'git', 'repository', 'ci-cd', 'merge-request', 'issues'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write GitLab projects and merge requests' }],
    homepage: 'https://gitlab.com',
    author: 'Zereight',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Postgres ────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Postgres,
    name: 'PostgreSQL',
    description: 'Query and manage PostgreSQL databases — run SQL, inspect schemas, and modify data.',
    repository: 'https://github.com/modelcontextprotocol/servers',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    requiredEnvVars: ['POSTGRES_CONNECTION_STRING'],
    optionalEnvVars: [],
    category: ExtensionCategory.Database,
    tags: ['postgresql', 'database', 'sql', 'query', 'relational'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write PostgreSQL database data' }],
    homepage: 'https://postgresql.org',
    author: 'MCP',
    version: '1.0.0',
    trusted: true,
  },

  // ─── MySQL ───────────────────────────────────────────────────────────────
  {
    type: ExtensionType.MySQL,
    name: 'MySQL',
    description: 'Query and manage MySQL databases — run SQL queries, inspect tables, and manage data.',
    repository: 'https://github.com/designcomputer/mysql-mcp-server',
    command: 'npx',
    args: ['-y', '@designcomputer/mysql-mcp-server'],
    requiredEnvVars: ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD'],
    optionalEnvVars: ['MYSQL_PORT', 'MYSQL_DATABASE'],
    category: ExtensionCategory.Database,
    tags: ['mysql', 'database', 'sql', 'query', 'relational'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write MySQL database data' }],
    homepage: 'https://mysql.com',
    author: 'Design Computer',
    version: '1.0.0',
    trusted: true,
  },

  // ─── SQLite ──────────────────────────────────────────────────────────────
  {
    type: ExtensionType.SQLite,
    name: 'SQLite',
    description: 'Query and manage SQLite databases — run SQL, inspect schemas, and modify records.',
    repository: 'https://github.com/modelcontextprotocol/servers',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite'],
    requiredEnvVars: [],
    optionalEnvVars: ['SQLITE_DB_PATH'],
    category: ExtensionCategory.Database,
    tags: ['sqlite', 'database', 'sql', 'query', 'embedded'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write SQLite database files' }],
    homepage: 'https://sqlite.org',
    author: 'MCP',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Redis ───────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Redis,
    name: 'Redis',
    description: 'Interact with Redis cache and data store — get/set keys, manage data structures.',
    repository: 'https://github.com/modelcontextprotocol/servers',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-redis'],
    requiredEnvVars: ['REDIS_URL'],
    optionalEnvVars: [],
    category: ExtensionCategory.Database,
    tags: ['redis', 'cache', 'key-value', 'data-store'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write Redis data' }],
    homepage: 'https://redis.io',
    author: 'MCP',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Elasticsearch ───────────────────────────────────────────────────────
  {
    type: ExtensionType.Elasticsearch,
    name: 'Elasticsearch',
    description: 'Search and index data with Elasticsearch — query indices, manage documents, and analyze data.',
    repository: 'https://github.com/elastic/mcp-server-elasticsearch',
    command: 'npx',
    args: ['-y', '@elastic/mcp-server-elasticsearch'],
    requiredEnvVars: ['ELASTICSEARCH_URL'],
    optionalEnvVars: ['ELASTICSEARCH_API_KEY'],
    category: ExtensionCategory.Search,
    tags: ['elasticsearch', 'search', 'indexing', 'analytics', 'full-text'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Query and manage Elasticsearch indices and documents' }],
    homepage: 'https://elastic.co',
    author: 'Elastic',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Docker ──────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Docker,
    name: 'Docker',
    description: 'Manage Docker containers, images, networks, and volumes — build, run, and orchestrate.',
    repository: 'https://github.com/QuantGeekDev/docker-mcp',
    command: 'npx',
    args: ['-y', '@quantgeekdev/docker-mcp'],
    requiredEnvVars: [],
    optionalEnvVars: ['DOCKER_HOST'],
    category: ExtensionCategory.Development,
    tags: ['docker', 'container', 'devops', 'orchestration'],
    permissions: [{ level: PermissionLevel.Admin, reason: 'Manage Docker containers and images' }],
    homepage: 'https://docker.com',
    author: 'QuantGeekDev',
    version: '1.0.0',
    trusted: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AI & Search
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Brave Search ────────────────────────────────────────────────────────
  {
    type: ExtensionType.BraveSearch,
    name: 'Brave Search',
    description: 'Web search using the Brave Search API — get real-time search results from the web.',
    repository: 'https://github.com/modelcontextprotocol/servers',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    requiredEnvVars: ['BRAVE_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Search,
    tags: ['search', 'web', 'brave', 'real-time'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Search the web via Brave Search API' }],
    homepage: 'https://brave.com/search/api',
    author: 'MCP',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Google Search ───────────────────────────────────────────────────────
  {
    type: ExtensionType.GoogleSearch,
    name: 'Google Custom Search',
    description: 'Search the web using Google Custom Search API — retrieve search results programmatically.',
    repository: 'https://github.com/niinpatel/mcp-server-google-search',
    command: 'npx',
    args: ['-y', '@niinpatel/mcp-server-google-search'],
    requiredEnvVars: ['GOOGLE_SEARCH_API_KEY', 'GOOGLE_SEARCH_CX'],
    optionalEnvVars: [],
    category: ExtensionCategory.Search,
    tags: ['search', 'google', 'web', 'custom-search'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Search the web via Google Custom Search API' }],
    homepage: 'https://developers.google.com/custom-search',
    author: 'Nitin Patel',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Bing Search ─────────────────────────────────────────────────────────
  {
    type: ExtensionType.BingSearch,
    name: 'Bing Search',
    description: 'Search the web using the Bing Web Search API — get news, images, and web results.',
    repository: 'https://github.com/leehanch/bing-search-mcp-server',
    command: 'npx',
    args: ['-y', '@leehanch/bing-search-mcp-server'],
    requiredEnvVars: ['BING_SEARCH_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Search,
    tags: ['search', 'bing', 'web', 'microsoft'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Search the web via Bing Search API' }],
    homepage: 'https://microsoft.com/bing',
    author: 'Lee Hanchi',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Serper ──────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Serper,
    name: 'Serper',
    description: 'Fast Google Search results via the Serper API — get organic results, knowledge graphs, and more.',
    repository: 'https://github.com/nicobailey/mcp-server-serper',
    command: 'npx',
    args: ['-y', '@nicobailey/mcp-server-serper'],
    requiredEnvVars: ['SERPER_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Search,
    tags: ['search', 'google', 'serper', 'api'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Search the web via Serper API' }],
    homepage: 'https://serper.dev',
    author: 'Nico Bailey',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Perplexity ──────────────────────────────────────────────────────────
  {
    type: ExtensionType.Perplexity,
    name: 'Perplexity',
    description: 'AI-powered search and answer engine via the Perplexity API — get cited, accurate responses.',
    repository: 'https://github.com/ppl-ai/mcp-server-perplexity',
    command: 'npx',
    args: ['-y', '@ppl-ai/mcp-server-perplexity'],
    requiredEnvVars: ['PERPLEXITY_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Search,
    tags: ['search', 'ai', 'perplexity', 'citations', 'answers'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Search via Perplexity AI API' }],
    homepage: 'https://perplexity.ai',
    author: 'Perplexity AI',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Jina Reader ─────────────────────────────────────────────────────────
  {
    type: ExtensionType.JinaReader,
    name: 'Jina Reader',
    description: 'Read and extract content from any URL using Jina AI Reader — convert web pages to clean markdown.',
    repository: 'https://github.com/jina-ai/mcp-server-jina-reader',
    command: 'npx',
    args: ['-y', '@jina/mcp-server-jina-reader'],
    requiredEnvVars: ['JINA_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Search,
    tags: ['reader', 'web', 'extraction', 'markdown', 'jina'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Read and extract web content via Jina API' }],
    homepage: 'https://jina.ai/reader',
    author: 'Jina AI',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Mojito Search ───────────────────────────────────────────────────────
  {
    type: ExtensionType.MojitoSearch,
    name: 'Mojito Search',
    description: 'AI-powered search and retrieval with Mojito — find relevant information across data sources.',
    repository: 'https://github.com/mojito-search/mcp-server',
    command: 'npx',
    args: ['-y', '@mojito-search/mcp-server'],
    requiredEnvVars: ['MOJITO_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Search,
    tags: ['search', 'ai', 'retrieval', 'mojito'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Search via Mojito API' }],
    homepage: 'https://mojito-search.com',
    author: 'Mojito Search',
    version: '1.0.0',
    trusted: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Cloud & Infrastructure
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── AWS ─────────────────────────────────────────────────────────────────
  {
    type: ExtensionType.AWS,
    name: 'AWS',
    description: 'Manage Amazon Web Services resources — EC2, S3, Lambda, IAM, and more across all AWS services.',
    repository: 'https://github.com/alexei-led/aws-mcp-server',
    command: 'npx',
    args: ['-y', '@alexei-led/aws-mcp-server'],
    requiredEnvVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    optionalEnvVars: ['AWS_REGION', 'AWS_SESSION_TOKEN'],
    category: ExtensionCategory.Cloud,
    tags: ['aws', 'cloud', 'ec2', 's3', 'lambda', 'infrastructure'],
    permissions: [{ level: PermissionLevel.Admin, reason: 'Manage AWS cloud resources' }],
    homepage: 'https://aws.amazon.com',
    author: 'Alexei Ledenev',
    version: '1.0.0',
    trusted: true,
  },

  // ─── GCP ─────────────────────────────────────────────────────────────────
  {
    type: ExtensionType.GCP,
    name: 'Google Cloud Platform',
    description: 'Manage GCP resources — Compute Engine, Cloud Storage, BigQuery, and more.',
    repository: 'https://github.com/anthropics/mcp-server-gcp',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-gcp'],
    requiredEnvVars: ['GOOGLE_CLOUD_PROJECT'],
    optionalEnvVars: ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_REGION'],
    category: ExtensionCategory.Cloud,
    tags: ['gcp', 'cloud', 'google', 'compute', 'bigquery', 'storage'],
    permissions: [{ level: PermissionLevel.Admin, reason: 'Manage Google Cloud Platform resources' }],
    homepage: 'https://cloud.google.com',
    author: 'Anthropic',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Azure ───────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Azure,
    name: 'Microsoft Azure',
    description: 'Manage Azure resources — virtual machines, storage, databases, and more.',
    repository: 'https://github.com/anthropics/mcp-server-azure',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-azure'],
    requiredEnvVars: ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_SUBSCRIPTION_ID'],
    optionalEnvVars: ['AZURE_RESOURCE_GROUP'],
    category: ExtensionCategory.Cloud,
    tags: ['azure', 'cloud', 'microsoft', 'vm', 'storage', 'infrastructure'],
    permissions: [{ level: PermissionLevel.Admin, reason: 'Manage Azure cloud resources' }],
    homepage: 'https://azure.microsoft.com',
    author: 'Anthropic',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Kubernetes ──────────────────────────────────────────────────────────
  {
    type: ExtensionType.Kubernetes,
    name: 'Kubernetes',
    description: 'Manage Kubernetes clusters — deploy workloads, manage pods, services, and configurations.',
    repository: 'https://github.com/Flux159/mcp-server-kubernetes',
    command: 'npx',
    args: ['-y', '@flux159/mcp-server-kubernetes'],
    requiredEnvVars: [],
    optionalEnvVars: ['KUBECONFIG', 'KUBERNETES_NAMESPACE'],
    category: ExtensionCategory.Cloud,
    tags: ['kubernetes', 'k8s', 'container', 'orchestration', 'cluster'],
    permissions: [{ level: PermissionLevel.Admin, reason: 'Manage Kubernetes cluster resources' }],
    homepage: 'https://kubernetes.io',
    author: 'Flux159',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Terraform ───────────────────────────────────────────────────────────
  {
    type: ExtensionType.Terraform,
    name: 'Terraform',
    description: 'Manage infrastructure as code with Terraform — plan, apply, and manage cloud resources.',
    repository: 'https://github.com/anthropics/mcp-server-terraform',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-terraform'],
    requiredEnvVars: [],
    optionalEnvVars: ['TF_CLI_CONFIG_FILE', 'TF_WORKSPACE'],
    category: ExtensionCategory.Cloud,
    tags: ['terraform', 'iac', 'infrastructure', 'provisioning'],
    permissions: [{ level: PermissionLevel.Admin, reason: 'Manage Terraform infrastructure' }],
    homepage: 'https://terraform.io',
    author: 'Anthropic',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Pulumi ──────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Pulumi,
    name: 'Pulumi',
    description: 'Infrastructure as code with Pulumi — deploy and manage cloud resources using familiar languages.',
    repository: 'https://github.com/pulumi/mcp-server-pulumi',
    command: 'npx',
    args: ['-y', '@pulumi/mcp-server'],
    requiredEnvVars: ['PULUMI_ACCESS_TOKEN'],
    optionalEnvVars: ['PULUMI_ORG', 'PULUMI_PROJECT'],
    category: ExtensionCategory.Cloud,
    tags: ['pulumi', 'iac', 'infrastructure', 'cloud', 'provisioning'],
    permissions: [{ level: PermissionLevel.Admin, reason: 'Manage Pulumi infrastructure stacks' }],
    homepage: 'https://pulumi.com',
    author: 'Pulumi',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Cloudflare ──────────────────────────────────────────────────────────
  {
    type: ExtensionType.Cloudflare,
    name: 'Cloudflare',
    description: 'Manage Cloudflare CDN, DNS, Workers, and security settings for your domains.',
    repository: 'https://github.com/cloudflare/mcp-server-cloudflare',
    command: 'npx',
    args: ['-y', '@cloudflare/mcp-server'],
    requiredEnvVars: ['CLOUDFLARE_API_TOKEN'],
    optionalEnvVars: ['CLOUDFLARE_ACCOUNT_ID'],
    category: ExtensionCategory.Cloud,
    tags: ['cloudflare', 'cdn', 'dns', 'workers', 'security'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Manage Cloudflare DNS and CDN settings' }],
    homepage: 'https://cloudflare.com',
    author: 'Cloudflare',
    version: '1.0.0',
    trusted: true,
  },

  // ─── DigitalOcean ────────────────────────────────────────────────────────
  {
    type: ExtensionType.DigitalOcean,
    name: 'DigitalOcean',
    description: 'Manage DigitalOcean droplets, databases, spaces, and other cloud resources.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-digitalocean',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-digitalocean'],
    requiredEnvVars: ['DIGITALOCEAN_API_TOKEN'],
    optionalEnvVars: [],
    category: ExtensionCategory.Cloud,
    tags: ['digitalocean', 'cloud', 'droplets', 'databases', 'spaces'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Manage DigitalOcean cloud resources' }],
    homepage: 'https://digitalocean.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Communication
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Slack ───────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Slack,
    name: 'Slack',
    description: 'Send and read messages, manage channels, and interact with Slack workspaces.',
    repository: 'https://github.com/modelcontextprotocol/servers',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    requiredEnvVars: ['SLACK_BOT_TOKEN'],
    optionalEnvVars: ['SLACK_TEAM_ID'],
    category: ExtensionCategory.Communication,
    tags: ['slack', 'messaging', 'channels', 'workspace', 'chat'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and send Slack messages' }],
    homepage: 'https://slack.com',
    author: 'MCP',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Discord ─────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Discord,
    name: 'Discord',
    description: 'Interact with Discord servers — send messages, manage channels, and read server activity.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-discord',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-discord'],
    requiredEnvVars: ['DISCORD_BOT_TOKEN'],
    optionalEnvVars: ['DISCORD_GUILD_ID'],
    category: ExtensionCategory.Communication,
    tags: ['discord', 'messaging', 'gaming', 'voice', 'chat'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and send Discord messages' }],
    homepage: 'https://discord.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Telegram ────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Telegram,
    name: 'Telegram',
    description: 'Send and receive messages, manage chats, and interact with Telegram bots.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-telegram',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-telegram'],
    requiredEnvVars: ['TELEGRAM_BOT_TOKEN'],
    optionalEnvVars: [],
    category: ExtensionCategory.Communication,
    tags: ['telegram', 'messaging', 'bot', 'chat'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and send Telegram messages' }],
    homepage: 'https://telegram.org',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Email ───────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Email,
    name: 'Email',
    description: 'Send and read emails via SMTP/IMAP — compose messages, check inbox, and manage folders.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-email',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-email'],
    requiredEnvVars: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'],
    optionalEnvVars: ['IMAP_HOST', 'SMTP_PORT', 'IMAP_PORT'],
    category: ExtensionCategory.Communication,
    tags: ['email', 'smtp', 'imap', 'mail', 'inbox'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Send and read emails' }],
    homepage: 'https://en.wikipedia.org/wiki/Email',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Notion ──────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Notion,
    name: 'Notion',
    description: 'Access and manage Notion workspaces — pages, databases, blocks, and content.',
    repository: 'https://github.com/makenotion/notion-mcp-server',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    requiredEnvVars: ['NOTION_API_KEY'],
    optionalEnvVars: ['NOTION_VERSION'],
    category: ExtensionCategory.Productivity,
    tags: ['notion', 'workspace', 'wiki', 'database', 'notes'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write Notion pages and databases' }],
    homepage: 'https://notion.so',
    author: 'Notion',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Confluence ──────────────────────────────────────────────────────────
  {
    type: ExtensionType.Confluence,
    name: 'Confluence',
    description: 'Access and manage Confluence wiki spaces, pages, and content.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-confluence',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-confluence'],
    requiredEnvVars: ['CONFLUENCE_URL', 'CONFLUENCE_USERNAME', 'CONFLUENCE_API_TOKEN'],
    optionalEnvVars: [],
    category: ExtensionCategory.Communication,
    tags: ['confluence', 'wiki', 'documentation', 'atlassian'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write Confluence pages' }],
    homepage: 'https://atlassian.com/software/confluence',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Jira ────────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Jira,
    name: 'Jira',
    description: 'Manage Jira issues, projects, sprints, and workflows for project tracking.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-jira',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-jira'],
    requiredEnvVars: ['JIRA_URL', 'JIRA_USERNAME', 'JIRA_API_TOKEN'],
    optionalEnvVars: ['JIRA_PROJECT_KEY'],
    category: ExtensionCategory.Communication,
    tags: ['jira', 'issues', 'project-management', 'agile', 'atlassian'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write Jira issues and projects' }],
    homepage: 'https://atlassian.com/software/jira',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Linear ──────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Linear,
    name: 'Linear',
    description: 'Manage Linear projects, issues, and teams — track bugs, features, and tasks.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-linear',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-linear'],
    requiredEnvVars: ['LINEAR_API_KEY'],
    optionalEnvVars: ['LINEAR_TEAM_ID'],
    category: ExtensionCategory.Communication,
    tags: ['linear', 'issues', 'project-management', 'tracking'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write Linear issues and projects' }],
    homepage: 'https://linear.app',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Trello ──────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Trello,
    name: 'Trello',
    description: 'Manage Trello boards, lists, and cards — organize projects with Kanban-style workflows.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-trello',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-trello'],
    requiredEnvVars: ['TRELLO_API_KEY', 'TRELLO_API_TOKEN'],
    optionalEnvVars: ['TRELLO_BOARD_ID'],
    category: ExtensionCategory.Communication,
    tags: ['trello', 'kanban', 'boards', 'cards', 'project-management'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write Trello boards and cards' }],
    homepage: 'https://trello.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Data & Analytics
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Stripe ──────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Stripe,
    name: 'Stripe',
    description: 'Manage Stripe payments, customers, subscriptions, invoices, and disputes.',
    repository: 'https://github.com/stripe/mcp-server-stripe',
    command: 'npx',
    args: ['-y', '@stripe/mcp-server'],
    requiredEnvVars: ['STRIPE_SECRET_KEY'],
    optionalEnvVars: ['STRIPE_WEBHOOK_SECRET'],
    category: ExtensionCategory.Data,
    tags: ['stripe', 'payments', 'billing', 'subscriptions', 'fintech'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Manage Stripe payments and customer data' }],
    homepage: 'https://stripe.com',
    author: 'Stripe',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Plaid ───────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Plaid,
    name: 'Plaid',
    description: 'Access financial data via Plaid — bank accounts, transactions, balances, and identity.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-plaid',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-plaid'],
    requiredEnvVars: ['PLAID_CLIENT_ID', 'PLAID_SECRET'],
    optionalEnvVars: ['PLAID_ENVIRONMENT'],
    category: ExtensionCategory.Data,
    tags: ['plaid', 'fintech', 'banking', 'transactions', 'financial'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Read financial data via Plaid API' }],
    homepage: 'https://plaid.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── HubSpot ─────────────────────────────────────────────────────────────
  {
    type: ExtensionType.HubSpot,
    name: 'HubSpot',
    description: 'Manage HubSpot CRM — contacts, deals, companies, and marketing workflows.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-hubspot',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-hubspot'],
    requiredEnvVars: ['HUBSPOT_ACCESS_TOKEN'],
    optionalEnvVars: [],
    category: ExtensionCategory.Data,
    tags: ['hubspot', 'crm', 'marketing', 'sales', 'contacts'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write HubSpot CRM data' }],
    homepage: 'https://hubspot.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Salesforce ──────────────────────────────────────────────────────────
  {
    type: ExtensionType.Salesforce,
    name: 'Salesforce',
    description: 'Manage Salesforce CRM — leads, opportunities, accounts, and custom objects.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-salesforce',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-salesforce'],
    requiredEnvVars: ['SALESFORCE_ACCESS_TOKEN', 'SALESFORCE_INSTANCE_URL'],
    optionalEnvVars: ['SALESFORCE_API_VERSION'],
    category: ExtensionCategory.Data,
    tags: ['salesforce', 'crm', 'leads', 'opportunities', 'accounts'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write Salesforce CRM data' }],
    homepage: 'https://salesforce.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Zendesk ─────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Zendesk,
    name: 'Zendesk',
    description: 'Manage Zendesk support tickets, users, and help center articles.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-zendesk',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-zendesk'],
    requiredEnvVars: ['ZENDESK_SUBDOMAIN', 'ZENDESK_EMAIL', 'ZENDESK_API_TOKEN'],
    optionalEnvVars: [],
    category: ExtensionCategory.Data,
    tags: ['zendesk', 'support', 'tickets', 'helpdesk', 'customer-service'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write Zendesk tickets and articles' }],
    homepage: 'https://zendesk.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Intercom ────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Intercom,
    name: 'Intercom',
    description: 'Manage Intercom conversations, contacts, and help center content for customer messaging.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-intercom',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-intercom'],
    requiredEnvVars: ['INTERCOM_ACCESS_TOKEN'],
    optionalEnvVars: [],
    category: ExtensionCategory.Data,
    tags: ['intercom', 'messaging', 'customer-support', 'conversations'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write Intercom conversations' }],
    homepage: 'https://intercom.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Analytics (Google Analytics) ────────────────────────────────────────
  {
    type: ExtensionType.Analytics,
    name: 'Google Analytics',
    description: 'Access Google Analytics data — page views, sessions, user metrics, and custom reports.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-google-analytics',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-google-analytics'],
    requiredEnvVars: ['GOOGLE_ANALYTICS_PROPERTY_ID'],
    optionalEnvVars: ['GOOGLE_APPLICATION_CREDENTIALS'],
    category: ExtensionCategory.Data,
    tags: ['analytics', 'google', 'metrics', 'reporting', 'web-analytics'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Read Google Analytics data' }],
    homepage: 'https://analytics.google.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Mixpanel ────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Mixpanel,
    name: 'Mixpanel',
    description: 'Query Mixpanel analytics — events, funnels, retention, and user behavior data.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-mixpanel',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-mixpanel'],
    requiredEnvVars: ['MIXPANEL_PROJECT_ID', 'MIXPANEL_SERVICE_ACCOUNT'],
    optionalEnvVars: [],
    category: ExtensionCategory.Data,
    tags: ['mixpanel', 'analytics', 'events', 'funnels', 'retention'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Read Mixpanel analytics data' }],
    homepage: 'https://mixpanel.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Amplitude ───────────────────────────────────────────────────────────
  {
    type: ExtensionType.Amplitude,
    name: 'Amplitude',
    description: 'Query Amplitude analytics — user events, behavioral cohorts, and product insights.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-amplitude',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-amplitude'],
    requiredEnvVars: ['AMPLITUDE_API_KEY', 'AMPLITUDE_SECRET_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Data,
    tags: ['amplitude', 'analytics', 'events', 'cohorts', 'product'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Read Amplitude analytics data' }],
    homepage: 'https://amplitude.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Datadog ─────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Datadog,
    name: 'Datadog',
    description: 'Monitor infrastructure and applications with Datadog — metrics, logs, traces, and dashboards.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-datadog',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-datadog'],
    requiredEnvVars: ['DATADOG_API_KEY', 'DATADOG_APP_KEY'],
    optionalEnvVars: ['DATADOG_SITE'],
    category: ExtensionCategory.Data,
    tags: ['datadog', 'monitoring', 'observability', 'logs', 'metrics'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Read Datadog metrics and logs' }],
    homepage: 'https://datadoghq.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Productivity
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Google Drive ────────────────────────────────────────────────────────
  {
    type: ExtensionType.GoogleDrive,
    name: 'Google Drive',
    description: 'Access and manage Google Drive files — search, read, create, and share documents.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-google-drive',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-google-drive'],
    requiredEnvVars: ['GOOGLE_DRIVE_CREDENTIALS'],
    optionalEnvVars: [],
    category: ExtensionCategory.Productivity,
    tags: ['google-drive', 'storage', 'files', 'documents', 'sharing'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write Google Drive files' }],
    homepage: 'https://drive.google.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Google Calendar ─────────────────────────────────────────────────────
  {
    type: ExtensionType.GoogleCalendar,
    name: 'Google Calendar',
    description: 'Manage Google Calendar events — create, update, search, and list upcoming meetings.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-google-calendar',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-google-calendar'],
    requiredEnvVars: ['GOOGLE_CALENDAR_CREDENTIALS'],
    optionalEnvVars: [],
    category: ExtensionCategory.Productivity,
    tags: ['google-calendar', 'calendar', 'events', 'scheduling'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write Google Calendar events' }],
    homepage: 'https://calendar.google.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Google Mail ─────────────────────────────────────────────────────────
  {
    type: ExtensionType.GoogleMail,
    name: 'Gmail',
    description: 'Read and send emails via Gmail API — manage inbox, drafts, labels, and threads.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-gmail',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-gmail'],
    requiredEnvVars: ['GMAIL_CREDENTIALS'],
    optionalEnvVars: [],
    category: ExtensionCategory.Productivity,
    tags: ['gmail', 'email', 'inbox', 'google', 'mail'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and send Gmail messages' }],
    homepage: 'https://mail.google.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Microsoft 365 ───────────────────────────────────────────────────────
  {
    type: ExtensionType.Microsoft365,
    name: 'Microsoft 365',
    description: 'Access Microsoft 365 services — Outlook mail, calendar, OneDrive, and Teams.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-microsoft-365',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-microsoft-365'],
    requiredEnvVars: ['MICROSOFT_365_CLIENT_ID', 'MICROSOFT_365_CLIENT_SECRET', 'MICROSOFT_365_TENANT_ID'],
    optionalEnvVars: [],
    category: ExtensionCategory.Productivity,
    tags: ['microsoft-365', 'office', 'outlook', 'onedrive', 'teams'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Access Microsoft 365 mail, calendar, and files' }],
    homepage: 'https://microsoft.com/microsoft-365',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Dropbox ─────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Dropbox,
    name: 'Dropbox',
    description: 'Access and manage Dropbox files — upload, download, search, and share.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-dropbox',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-dropbox'],
    requiredEnvVars: ['DROPBOX_ACCESS_TOKEN'],
    optionalEnvVars: [],
    category: ExtensionCategory.Productivity,
    tags: ['dropbox', 'storage', 'files', 'cloud', 'sharing'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write Dropbox files' }],
    homepage: 'https://dropbox.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Airtable ────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Airtable,
    name: 'Airtable',
    description: 'Manage Airtable bases, tables, and records — query, create, and update data.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-airtable',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-airtable'],
    requiredEnvVars: ['AIRTABLE_API_KEY'],
    optionalEnvVars: ['AIRTABLE_BASE_ID'],
    category: ExtensionCategory.Productivity,
    tags: ['airtable', 'database', 'spreadsheet', 'records', 'no-code'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write Airtable records' }],
    homepage: 'https://airtable.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Miro ────────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Miro,
    name: 'Miro',
    description: 'Access Miro whiteboards — create and manage boards, shapes, and collaborative content.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-miro',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-miro'],
    requiredEnvVars: ['MIRO_ACCESS_TOKEN'],
    optionalEnvVars: [],
    category: ExtensionCategory.Design,
    tags: ['miro', 'whiteboard', 'collaboration', 'diagram', 'visual'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write Miro boards' }],
    homepage: 'https://miro.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Lark ────────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Lark,
    name: 'Lark / Feishu',
    description: 'Access Lark/Feishu workspace — docs, sheets, messages, and calendar for team collaboration.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-lark',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-lark'],
    requiredEnvVars: ['LARK_APP_ID', 'LARK_APP_SECRET'],
    optionalEnvVars: [],
    category: ExtensionCategory.Productivity,
    tags: ['lark', 'feishu', 'collaboration', 'docs', 'sheets', 'messaging'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write Lark workspace content' }],
    homepage: 'https://larksuite.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Zoom ────────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Zoom,
    name: 'Zoom',
    description: 'Manage Zoom meetings — schedule, list, and control meetings and webinars.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-zoom',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-zoom'],
    requiredEnvVars: ['ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET'],
    optionalEnvVars: [],
    category: ExtensionCategory.Productivity,
    tags: ['zoom', 'video', 'meetings', 'webinar', 'conference'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Manage Zoom meetings and settings' }],
    homepage: 'https://zoom.us',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Specialized
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Unreal Engine ───────────────────────────────────────────────────────
  {
    type: ExtensionType.UnrealEngine,
    name: 'Unreal Engine',
    description: 'Control Unreal Engine editor — manipulate actors, run blueprints, and render scenes via Python.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-unreal-engine',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-unreal-engine'],
    requiredEnvVars: [],
    optionalEnvVars: ['UNREAL_ENGINE_PORT'],
    category: ExtensionCategory.Design,
    tags: ['unreal-engine', 'game-engine', '3d', 'rendering', 'blueprint'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Control Unreal Engine editor and scenes' }],
    homepage: 'https://unrealengine.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Home Assistant ──────────────────────────────────────────────────────
  {
    type: ExtensionType.HomeAssistant,
    name: 'Home Assistant',
    description: 'Control smart home devices via Home Assistant — lights, sensors, switches, and automations.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-homeassistant',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-homeassistant'],
    requiredEnvVars: ['HOMEASSISTANT_URL', 'HOMEASSISTANT_TOKEN'],
    optionalEnvVars: [],
    category: ExtensionCategory.Automation,
    tags: ['home-assistant', 'iot', 'smart-home', 'automation', 'sensors'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Control smart home devices and automations' }],
    homepage: 'https://home-assistant.io',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Weather ─────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Weather,
    name: 'Weather',
    description: 'Get current weather conditions, forecasts, and historical data for any location.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-weather',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-weather'],
    requiredEnvVars: ['OPENWEATHER_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Data,
    tags: ['weather', 'forecast', 'temperature', 'conditions', 'climate'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Read weather data via API' }],
    homepage: 'https://openweathermap.org',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Maps (Google Maps) ──────────────────────────────────────────────────
  {
    type: ExtensionType.Maps,
    name: 'Google Maps',
    description: 'Access Google Maps APIs — geocoding, directions, places, and distance calculations.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-google-maps',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-google-maps'],
    requiredEnvVars: ['GOOGLE_MAPS_API_KEY'],
    optionalEnvVars: [],
    category: ExtensionCategory.Data,
    tags: ['maps', 'google', 'geocoding', 'directions', 'places'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Access Google Maps APIs' }],
    homepage: 'https://maps.google.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Spotify ─────────────────────────────────────────────────────────────
  {
    type: ExtensionType.Spotify,
    name: 'Spotify',
    description: 'Control Spotify playback, search music, manage playlists, and get recommendations.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-spotify',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-spotify'],
    requiredEnvVars: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'],
    optionalEnvVars: ['SPOTIFY_REDIRECT_URI'],
    category: ExtensionCategory.Media,
    tags: ['spotify', 'music', 'playback', 'playlists', 'streaming'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Control Spotify playback and manage playlists' }],
    homepage: 'https://spotify.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Twitter / X ─────────────────────────────────────────────────────────
  {
    type: ExtensionType.Twitter,
    name: 'Twitter / X',
    description: 'Post tweets, search timelines, and manage Twitter/X account interactions.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-twitter',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-twitter'],
    requiredEnvVars: ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'],
    optionalEnvVars: [],
    category: ExtensionCategory.Communication,
    tags: ['twitter', 'x', 'social-media', 'tweets', 'timeline'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Post tweets and read timeline data' }],
    homepage: 'https://x.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },

  // ─── Hacker News ─────────────────────────────────────────────────────────
  {
    type: ExtensionType.HackerNews,
    name: 'Hacker News',
    description: 'Browse Hacker News stories, comments, and user profiles from the Y Combinator community.',
    repository: 'https://github.com/nicholasgriffintn/mcp-server-hackernews',
    command: 'npx',
    args: ['-y', '@nicholasgriffintn/mcp-server-hackernews'],
    requiredEnvVars: [],
    optionalEnvVars: [],
    category: ExtensionCategory.Communication,
    tags: ['hackernews', 'news', 'yc', 'tech', 'community'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Read Hacker News stories and comments' }],
    homepage: 'https://news.ycombinator.com',
    author: 'Nicholas Griffin',
    version: '1.0.0',
    trusted: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Known malicious extension patterns
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_MALICIOUS_EXTENSIONS: Set<string> = new Set([
  // Placeholder — in production, this would be populated from a security feed
  // 'malicious-extension-1',
  // 'malicious-extension-2',
]);

const SUSPICIOUS_COMMAND_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+\//,
  /curl\s+.*\|\s*(ba)?sh/,
  /wget\s+.*\|\s*(ba)?sh/,
  /mkfs/,
  /dd\s+if=/,
  /:(){:|:&};:/,
  /nc\s+-l/,
];

// ─────────────────────────────────────────────────────────────────────────────
// MCP Registry class
// ─────────────────────────────────────────────────────────────────────────────

export class MCPRegistry {
  private extensions: Map<ExtensionType, CommunityExtensionEntry> = new Map();
  private corporateAllowlist: Set<ExtensionType> | null = null;
  private installedServers: Map<ExtensionType, { command: string; args: string[] }> = new Map();
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(os.homedir(), '.openagent', 'mcp-registry.json');

    // Load all community extensions
    for (const ext of COMMUNITY_EXTENSIONS) {
      this.extensions.set(ext.type, ext);
    }
  }

  // ─── Registry queries ─────────────────────────────────────────────────────

  /** Get all registered community extensions */
  getAllExtensions(): CommunityExtensionEntry[] {
    return Array.from(this.extensions.values());
  }

  /** Get a specific extension by type */
  getExtension(type: ExtensionType): CommunityExtensionEntry | undefined {
    return this.extensions.get(type);
  }

  /** Get extensions by category */
  getExtensionsByCategory(category: ExtensionCategory): CommunityExtensionEntry[] {
    return Array.from(this.extensions.values()).filter((ext) => ext.category === category);
  }

  /** Search extensions by query */
  search(query: string): CommunityExtensionEntry[] {
    const queryLower = query.toLowerCase();
    const terms = queryLower.split(/\s+/);

    return Array.from(this.extensions.values()).filter((ext) => {
      const searchable = [
        ext.name,
        ext.description,
        ext.type,
        ...ext.tags,
        ext.category,
        ext.author || '',
      ]
        .join(' ')
        .toLowerCase();

      return terms.every((term) => searchable.includes(term));
    });
  }

  /** Get the count of registered extensions */
  getExtensionCount(): number {
    return this.extensions.size;
  }

  /** Get all required environment variables across all extensions */
  getAllRequiredEnvVars(): Partial<Record<ExtensionType, string[]>> {
    const result: Partial<Record<ExtensionType, string[]>> = {};
    for (const [type, ext] of this.extensions) {
      result[type] = ext.requiredEnvVars;
    }
    return result;
  }

  // ─── Malware detection ────────────────────────────────────────────────────

  /** Check an extension for malware or security concerns */
  checkMalware(type: ExtensionType): MalwareCheckResult {
    const ext = this.extensions.get(type);
    const flags: MalwareFlag[] = [];

    // Check against known-bad list
    if (KNOWN_MALICIOUS_EXTENSIONS.has(type)) {
      flags.push({
        type: 'known_malicious',
        message: `Extension "${type}" is in the known malicious extensions list`,
        severity: 'critical',
      });
    }

    if (ext) {
      // Check for suspicious commands
      const fullCommand = `${ext.command} ${ext.args.join(' ')}`;
      for (const pattern of SUSPICIOUS_COMMAND_PATTERNS) {
        if (pattern.test(fullCommand)) {
          flags.push({
            type: 'suspicious_command',
            message: `Extension uses a suspicious command pattern`,
            severity: 'high',
            detail: `Pattern: ${pattern.source}`,
          });
        }
      }

      // Check for unverified sources
      if (!ext.trusted) {
        flags.push({
          type: 'unverified_source',
          message: `Extension is not from a verified/trusted source`,
          severity: 'medium',
        });
      }

      // Check for dangerous permissions
      const adminPerms = ext.permissions.filter((p) => p.level === PermissionLevel.Admin);
      for (const perm of adminPerms) {
        flags.push({
          type: 'dangerous_permission',
          message: `Extension requests admin-level permissions: ${perm.reason}`,
          severity: 'medium',
          detail: `Resources: ${perm.resources?.join(', ') || 'all'}`,
        });
      }

      // Check repository URL
      if (ext.repository && !ext.repository.startsWith('https://github.com/')) {
        flags.push({
          type: 'suspicious_url',
          message: `Extension repository is not on GitHub: ${ext.repository}`,
          severity: 'low',
        });
      }
    }

    return {
      safe: !flags.some((f) => f.severity === 'critical' || f.severity === 'high'),
      flags,
      checkedAt: new Date().toISOString(),
    };
  }

  /** Check an arbitrary URL or command for malware before installation */
  checkUrlOrCommand(input: string): MalwareCheckResult {
    const flags: MalwareFlag[] = [];

    for (const pattern of SUSPICIOUS_COMMAND_PATTERNS) {
      if (pattern.test(input)) {
        flags.push({
          type: 'suspicious_command',
          message: 'Input contains a suspicious command pattern',
          severity: 'critical',
          detail: `Pattern: ${pattern.source}`,
        });
      }
    }

    // Check for non-HTTPS URLs
    if (input.startsWith('http://')) {
      flags.push({
        type: 'suspicious_url',
        message: 'URL uses insecure HTTP protocol',
        severity: 'medium',
      });
    }

    return {
      safe: !flags.some((f) => f.severity === 'critical'),
      flags,
      checkedAt: new Date().toISOString(),
    };
  }

  // ─── Corporate allowlist ──────────────────────────────────────────────────

  /** Set the corporate allowlist — only these extensions can be installed */
  setCorporateAllowlist(types: ExtensionType[]): void {
    this.corporateAllowlist = new Set(types);
  }

  /** Clear the corporate allowlist */
  clearCorporateAllowlist(): void {
    this.corporateAllowlist = null;
  }

  /** Check if an extension is allowed by the corporate allowlist */
  isAllowedByCorporatePolicy(type: ExtensionType): boolean {
    if (!this.corporateAllowlist) return true; // No allowlist = everything allowed
    return this.corporateAllowlist.has(type);
  }

  /** Get the corporate allowlist */
  getCorporateAllowlist(): ExtensionType[] | null {
    return this.corporateAllowlist ? Array.from(this.corporateAllowlist) : null;
  }

  // ─── Auto-discovery ───────────────────────────────────────────────────────

  /** Auto-discover installed MCP servers by checking common paths and configs */
  async discoverInstalledServers(): Promise<Array<{
    type: ExtensionType;
    name: string;
    command: string;
    args: string[];
    source: string;
  }>> {
    const discovered: Array<{
      type: ExtensionType;
      name: string;
      command: string;
      args: string[];
      source: string;
    }> = [];

    // Check for MCP servers in common config locations
    const configPaths = [
      path.join(os.homedir(), '.config', 'mcp', 'servers.json'),
      path.join(os.homedir(), '.mcp', 'servers.json'),
      path.join(os.homedir(), '.openagent', 'mcp-servers.json'),
    ];

    for (const configPath of configPaths) {
      try {
        const data = await fs.readFile(configPath, 'utf-8');
        const servers = JSON.parse(data) as Record<string, { command: string; args: string[] }>;

        for (const [name, config] of Object.entries(servers)) {
          // Try to match with known extensions
          const matchingExt = Array.from(this.extensions.values()).find(
            (ext) => ext.name.toLowerCase() === name.toLowerCase() || ext.type === name,
          );

          if (matchingExt) {
            discovered.push({
              type: matchingExt.type,
              name: matchingExt.name,
              command: config.command,
              args: config.args,
              source: configPath,
            });
            this.installedServers.set(matchingExt.type, {
              command: config.command,
              args: config.args,
            });
          }
        }
      } catch {
        // Config file doesn't exist or is invalid — skip
      }
    }

    // Check for globally installed npm/pip packages that might be MCP servers
    try {
      const { execSync } = require('child_process');
      const npmList = execSync('npm list -g --json --depth=0 2>/dev/null', {
        encoding: 'utf-8',
        timeout: 10000,
      });
      const npmPackages = JSON.parse(npmList) as { dependencies: Record<string, { version: string }> };

      for (const [pkgName] of Object.entries(npmPackages.dependencies || {})) {
        const matchingExt = Array.from(this.extensions.values()).find(
          (ext) => ext.args.some((arg) => arg.includes(pkgName)),
        );
        if (matchingExt && !discovered.some((d) => d.type === matchingExt.type)) {
          discovered.push({
            type: matchingExt.type,
            name: matchingExt.name,
            command: matchingExt.command,
            args: matchingExt.args,
            source: 'npm-global',
          });
        }
      }
    } catch {
      // npm not available or no global packages
    }

    return discovered;
  }

  /** Get the discovered server config for an extension type */
  getDiscoveredServerConfig(type: ExtensionType): { command: string; args: string[] } | undefined {
    return this.installedServers.get(type);
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  /** Save the registry state to disk */
  async save(): Promise<void> {
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });

    const data = {
      corporateAllowlist: this.corporateAllowlist ? Array.from(this.corporateAllowlist) : null,
      installedServers: Object.fromEntries(this.installedServers),
    };

    await fs.writeFile(this.configPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /** Load the registry state from disk */
  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(data);

      if (parsed.corporateAllowlist) {
        this.corporateAllowlist = new Set(parsed.corporateAllowlist);
      }

      if (parsed.installedServers) {
        for (const [type, config] of Object.entries(parsed.installedServers)) {
          this.installedServers.set(type as ExtensionType, config as { command: string; args: string[] });
        }
      }
    } catch {
      // Config doesn't exist yet — use defaults
    }
  }

  /** Register a custom community extension */
  registerExtension(entry: CommunityExtensionEntry): void {
    this.extensions.set(entry.type, entry);
  }

  /** Unregister a community extension */
  unregisterExtension(type: ExtensionType): boolean {
    return this.extensions.delete(type);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton instance
// ─────────────────────────────────────────────────────────────────────────────

let registryInstance: MCPRegistry | null = null;

export function getMCPRegistry(): MCPRegistry {
  if (!registryInstance) {
    registryInstance = new MCPRegistry();
  }
  return registryInstance;
}
