/**
 * OpenAgent-Desktop - Extension Marketplace
 *
 * Discover, browse, and install community extensions.
 * Like an app store for MCP servers and agent extensions.
 * Supports categories, ratings, and verified badges.
 */

import { EventEmitter } from 'events';
import * as os from 'os';
import {
  ExtensionType,
  ExtensionConfig,
  MCPServerConfig,
  PermissionLevel,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace Types
// ─────────────────────────────────────────────────────────────────────────────

export enum MarketplaceCategory {
  Development = 'development',
  Productivity = 'productivity',
  Browser = 'browser',
  Cloud = 'cloud',
  Database = 'database',
  Communication = 'communication',
  Design = 'design',
  Media = 'media',
  Search = 'search',
  Memory = 'memory',
  System = 'system',
  Automation = 'automation',
}

export type SortField = 'rating' | 'downloads' | 'name' | 'lastUpdated';

export interface MarketplaceExtension {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: MarketplaceCategory;
  tags: string[];
  rating: number;
  downloads: number;
  verified: boolean;
  homepage: string;
  repository: string;
  installSource: 'marketplace' | 'npm' | 'github' | 'local';
  lastUpdated: string;
  compatibility: {
    nodeVersion: string;
    platforms: ('win32' | 'darwin' | 'linux')[];
  };
  icon?: string;
  mcpServer?: MCPServerConfig;
  requiredEnvVars: string[];
  optionalEnvVars: string[];
  permissions: { level: PermissionLevel; reason: string }[];
  changelog?: string;
  screenshots?: string[];
  longDescription?: string;
}

export interface MarketplaceRating {
  extensionId: string;
  userId: string;
  rating: number;
  comment?: string;
  timestamp: string;
}

export interface MarketplaceReport {
  extensionId: string;
  reporterId: string;
  reason: string;
  details?: string;
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace Catalog — 25+ community extensions (mock data representing real MCP servers)
// ─────────────────────────────────────────────────────────────────────────────

const MARKETPLACE_CATALOG: MarketplaceExtension[] = [
  {
    id: 'mkt-github',
    name: 'GitHub',
    description: 'Manage repositories, issues, pull requests, and code reviews on GitHub.',
    version: '1.2.0',
    author: 'GitHub Inc.',
    category: MarketplaceCategory.Development,
    tags: ['git', 'repository', 'issues', 'pull-request', 'code-review'],
    rating: 4.8,
    downloads: 15420,
    verified: true,
    homepage: 'https://github.com',
    repository: 'https://github.com/github/github-mcp-server',
    installSource: 'marketplace',
    lastUpdated: '2025-01-15T10:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '🐙',
    mcpServer: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: {} },
    requiredEnvVars: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Read, reason: 'Read repository data and manage issues' }],
    longDescription: 'Full-featured GitHub integration for managing repositories, issues, pull requests, and code reviews. Supports creating branches, committing files, searching code, and more.',
    changelog: '## v1.2.0\n- Added branch protection rules\n- Improved search performance\n- Fixed issue creation bug',
  },
  {
    id: 'mkt-playwright',
    name: 'Playwright',
    description: 'Browser automation with Playwright — navigate, screenshot, fill forms, and extract data.',
    version: '1.1.0',
    author: 'Microsoft',
    category: MarketplaceCategory.Browser,
    tags: ['browser', 'automation', 'testing', 'scraping', 'web'],
    rating: 4.7,
    downloads: 12800,
    verified: true,
    homepage: 'https://playwright.dev',
    repository: 'https://github.com/anthropics/mcp-playwright',
    installSource: 'marketplace',
    lastUpdated: '2025-01-10T08:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '🎭',
    mcpServer: { command: 'npx', args: ['-y', '@anthropic-ai/mcp-playwright'], env: {} },
    requiredEnvVars: [],
    optionalEnvVars: ['PLAYWRIGHT_BROWSERS_PATH'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Control browser for automation' }],
    longDescription: 'Automate browser interactions with Playwright. Navigate web pages, take screenshots, fill forms, click elements, and extract data. Perfect for testing and web automation workflows.',
  },
  {
    id: 'mkt-postgres',
    name: 'PostgreSQL',
    description: 'Query and manage PostgreSQL databases with full SQL support.',
    version: '1.0.0',
    author: 'MCP Community',
    category: MarketplaceCategory.Database,
    tags: ['database', 'sql', 'postgres', 'query'],
    rating: 4.6,
    downloads: 9500,
    verified: true,
    homepage: 'https://postgresql.org',
    repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
    installSource: 'marketplace',
    lastUpdated: '2025-01-05T12:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '🐘',
    mcpServer: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres'], env: {} },
    requiredEnvVars: ['POSTGRES_CONNECTION_STRING'],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Write, reason: 'Execute SQL queries on the database' }],
    longDescription: 'Connect to PostgreSQL databases and execute queries. Supports read and write operations, schema inspection, and data analysis directly from your agent.',
  },
  {
    id: 'mkt-slack',
    name: 'Slack',
    description: 'Send messages, read channels, and manage Slack workspaces.',
    version: '1.0.2',
    author: 'Slack Technologies',
    category: MarketplaceCategory.Communication,
    tags: ['messaging', 'teams', 'channels', 'notifications'],
    rating: 4.5,
    downloads: 8200,
    verified: true,
    homepage: 'https://slack.com',
    repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
    installSource: 'marketplace',
    lastUpdated: '2025-01-08T14:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '💬',
    mcpServer: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'], env: {} },
    requiredEnvVars: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Read, reason: 'Read and send messages in Slack channels' }],
  },
  {
    id: 'mkt-figma',
    name: 'Figma',
    description: 'Access Figma designs, components, and design tokens programmatically.',
    version: '0.9.1',
    author: 'Figma Inc.',
    category: MarketplaceCategory.Design,
    tags: ['design', 'ui', 'components', 'tokens', 'prototype'],
    rating: 4.4,
    downloads: 6100,
    verified: true,
    homepage: 'https://figma.com',
    repository: 'https://github.com/figma/figma-mcp-server',
    installSource: 'marketplace',
    lastUpdated: '2024-12-20T16:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '🎨',
    mcpServer: { command: 'npx', args: ['-y', '@anthropic-ai/figma-mcp'], env: {} },
    requiredEnvVars: ['FIGMA_ACCESS_TOKEN'],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Read, reason: 'Read design files and components' }],
  },
  {
    id: 'mkt-filesystem',
    name: 'Filesystem',
    description: 'Secure file system operations — read, write, search, and manage files and directories.',
    version: '1.0.0',
    author: 'MCP Official',
    category: MarketplaceCategory.System,
    tags: ['files', 'filesystem', 'read', 'write', 'search'],
    rating: 4.9,
    downloads: 22000,
    verified: true,
    homepage: 'https://modelcontextprotocol.io',
    repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    installSource: 'marketplace',
    lastUpdated: '2025-01-12T09:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '📁',
    mcpServer: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'], env: {} },
    requiredEnvVars: [],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write files on the filesystem' }],
  },
  {
    id: 'mkt-brave-search',
    name: 'Brave Search',
    description: 'Search the web using Brave Search API with privacy-first results.',
    version: '1.0.0',
    author: 'Brave Software',
    category: MarketplaceCategory.Search,
    tags: ['search', 'web', 'privacy', 'api'],
    rating: 4.5,
    downloads: 11200,
    verified: true,
    homepage: 'https://brave.com/search',
    repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
    installSource: 'marketplace',
    lastUpdated: '2025-01-06T11:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '🦁',
    mcpServer: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'], env: {} },
    requiredEnvVars: ['BRAVE_API_KEY'],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Read, reason: 'Perform web searches' }],
  },
  {
    id: 'mkt-memory',
    name: 'Knowledge Graph Memory',
    description: 'Persistent memory using a knowledge graph — store, recall, and connect information.',
    version: '1.0.0',
    author: 'MCP Official',
    category: MarketplaceCategory.Memory,
    tags: ['memory', 'knowledge-graph', 'persistence', 'recall'],
    rating: 4.7,
    downloads: 13500,
    verified: true,
    homepage: 'https://modelcontextprotocol.io',
    repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
    installSource: 'marketplace',
    lastUpdated: '2025-01-11T07:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '🧠',
    mcpServer: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'], env: {} },
    requiredEnvVars: [],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Write, reason: 'Store and retrieve memories' }],
  },
  {
    id: 'mkt-aws',
    name: 'Amazon Web Services',
    description: 'Manage AWS resources — EC2, S3, Lambda, CloudFormation, and more.',
    version: '0.8.0',
    author: 'Amazon Web Services',
    category: MarketplaceCategory.Cloud,
    tags: ['aws', 'cloud', 'ec2', 's3', 'lambda', 'infrastructure'],
    rating: 4.3,
    downloads: 7800,
    verified: true,
    homepage: 'https://aws.amazon.com',
    repository: 'https://github.com/anthropics/aws-mcp-server',
    installSource: 'marketplace',
    lastUpdated: '2024-12-28T13:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '☁️',
    mcpServer: { command: 'npx', args: ['-y', '@aws/mcp-server'], env: {} },
    requiredEnvVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    optionalEnvVars: ['AWS_REGION', 'AWS_SESSION_TOKEN'],
    permissions: [{ level: PermissionLevel.Admin, reason: 'Manage cloud infrastructure resources' }],
  },
  {
    id: 'mkt-docker',
    name: 'Docker',
    description: 'Manage Docker containers, images, networks, and volumes.',
    version: '1.0.0',
    author: 'Docker Inc.',
    category: MarketplaceCategory.Development,
    tags: ['docker', 'containers', 'devops', 'infrastructure'],
    rating: 4.6,
    downloads: 10200,
    verified: true,
    homepage: 'https://docker.com',
    repository: 'https://github.com/docker/mcp-server-docker',
    installSource: 'marketplace',
    lastUpdated: '2025-01-03T10:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '🐳',
    mcpServer: { command: 'npx', args: ['-y', '@docker/mcp-server'], env: {} },
    requiredEnvVars: [],
    optionalEnvVars: ['DOCKER_HOST'],
    permissions: [{ level: PermissionLevel.Admin, reason: 'Manage Docker containers and images' }],
  },
  {
    id: 'mkt-notion',
    name: 'Notion',
    description: 'Access and manage Notion workspaces — pages, databases, and blocks.',
    version: '1.1.0',
    author: 'Notion Labs',
    category: MarketplaceCategory.Productivity,
    tags: ['notion', 'wiki', 'notes', 'databases', 'workspace'],
    rating: 4.4,
    downloads: 7600,
    verified: true,
    homepage: 'https://notion.so',
    repository: 'https://github.com/makenotion/notion-mcp-server',
    installSource: 'marketplace',
    lastUpdated: '2025-01-07T15:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '📝',
    mcpServer: { command: 'npx', args: ['-y', '@notionhq/notion-mcp-server'], env: {} },
    requiredEnvVars: ['NOTION_API_KEY'],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and modify Notion pages and databases' }],
  },
  {
    id: 'mkt-linear',
    name: 'Linear',
    description: 'Project management with Linear — issues, projects, and team workflows.',
    version: '1.0.0',
    author: 'Linear Inc.',
    category: MarketplaceCategory.Productivity,
    tags: ['project-management', 'issues', 'agile', 'tracking'],
    rating: 4.5,
    downloads: 5400,
    verified: true,
    homepage: 'https://linear.app',
    repository: 'https://github.com/linearapp/linear-mcp-server',
    installSource: 'marketplace',
    lastUpdated: '2024-12-15T12:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '📐',
    mcpServer: { command: 'npx', args: ['-y', '@linear/mcp-server'], env: {} },
    requiredEnvVars: ['LINEAR_API_KEY'],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Write, reason: 'Create and manage issues and projects' }],
  },
  {
    id: 'mkt-redis',
    name: 'Redis',
    description: 'Interact with Redis — get, set, search, and manage cached data.',
    version: '1.0.0',
    author: 'Redis Ltd.',
    category: MarketplaceCategory.Database,
    tags: ['redis', 'cache', 'key-value', 'nosql'],
    rating: 4.4,
    downloads: 6800,
    verified: true,
    homepage: 'https://redis.io',
    repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/redis',
    installSource: 'marketplace',
    lastUpdated: '2024-12-22T09:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '🔴',
    mcpServer: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-redis'], env: {} },
    requiredEnvVars: ['REDIS_URL'],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Write, reason: 'Read and write data in Redis' }],
  },
  {
    id: 'mkt-firecrawl',
    name: 'Firecrawl',
    description: 'Scrape and crawl web pages with advanced extraction capabilities.',
    version: '1.0.0',
    author: 'Mendable AI',
    category: MarketplaceCategory.Browser,
    tags: ['scraping', 'crawling', 'web', 'extraction', 'data'],
    rating: 4.3,
    downloads: 5900,
    verified: true,
    homepage: 'https://firecrawl.dev',
    repository: 'https://github.com/mendableai/firecrawl-mcp-server',
    installSource: 'marketplace',
    lastUpdated: '2024-12-18T14:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '🔥',
    mcpServer: { command: 'npx', args: ['-y', '@firecrawl/mcp-server'], env: {} },
    requiredEnvVars: ['FIRECRAWL_API_KEY'],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Read, reason: 'Scrape and crawl web pages' }],
  },
  {
    id: 'mkt-spotify',
    name: 'Spotify',
    description: 'Control Spotify playback, search music, and manage playlists.',
    version: '0.5.0',
    author: 'Community',
    category: MarketplaceCategory.Media,
    tags: ['music', 'spotify', 'playback', 'playlists', 'streaming'],
    rating: 3.9,
    downloads: 3200,
    verified: false,
    homepage: 'https://spotify.com',
    repository: 'https://github.com/spotify-mcp/spotify-mcp-server',
    installSource: 'marketplace',
    lastUpdated: '2024-11-20T08:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '🎵',
    mcpServer: { command: 'npx', args: ['-y', '@spotify-mcp/server'], env: {} },
    requiredEnvVars: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'],
    optionalEnvVars: ['SPOTIFY_REDIRECT_URI'],
    permissions: [{ level: PermissionLevel.Read, reason: 'Read and control Spotify playback' }],
  },
  {
    id: 'mkt-elevenlabs',
    name: 'ElevenLabs',
    description: 'Text-to-speech and voice AI with ElevenLabs — generate natural-sounding audio.',
    version: '1.0.0',
    author: 'ElevenLabs Inc.',
    category: MarketplaceCategory.Media,
    tags: ['tts', 'voice', 'audio', 'speech', 'ai'],
    rating: 4.6,
    downloads: 4500,
    verified: true,
    homepage: 'https://elevenlabs.io',
    repository: 'https://github.com/elevenlabs/elevenlabs-mcp-server',
    installSource: 'marketplace',
    lastUpdated: '2025-01-02T16:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '🎙️',
    mcpServer: { command: 'npx', args: ['-y', '@elevenlabs/mcp-server'], env: {} },
    requiredEnvVars: ['ELEVENLABS_API_KEY'],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Read, reason: 'Generate speech from text' }],
  },
  {
    id: 'mkt-vercel',
    name: 'Vercel',
    description: 'Deploy and manage Vercel projects, deployments, and domains.',
    version: '1.0.0',
    author: 'Vercel Inc.',
    category: MarketplaceCategory.Cloud,
    tags: ['deployment', 'hosting', 'serverless', 'vercel', 'web'],
    rating: 4.5,
    downloads: 6300,
    verified: true,
    homepage: 'https://vercel.com',
    repository: 'https://github.com/vercel/vercel-mcp-server',
    installSource: 'marketplace',
    lastUpdated: '2025-01-09T11:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '▲',
    mcpServer: { command: 'npx', args: ['-y', '@vercel/mcp-server'], env: {} },
    requiredEnvVars: ['VERCEL_TOKEN'],
    optionalEnvVars: ['VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'],
    permissions: [{ level: PermissionLevel.Write, reason: 'Deploy and manage projects' }],
  },
  {
    id: 'mkt-supabase',
    name: 'Supabase',
    description: 'Supabase backend-as-a-service — database, auth, storage, and realtime.',
    version: '1.0.0',
    author: 'Supabase Inc.',
    category: MarketplaceCategory.Database,
    tags: ['database', 'backend', 'auth', 'storage', 'realtime'],
    rating: 4.5,
    downloads: 7100,
    verified: true,
    homepage: 'https://supabase.com',
    repository: 'https://github.com/supabase-community/supabase-mcp-server',
    installSource: 'marketplace',
    lastUpdated: '2025-01-04T13:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '⚡',
    mcpServer: { command: 'npx', args: ['-y', '@supabase/mcp-server'], env: {} },
    requiredEnvVars: ['SUPABASE_URL', 'SUPABASE_KEY'],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Write, reason: 'Access Supabase database and services' }],
  },
  {
    id: 'mkt-exa-search',
    name: 'Exa Search',
    description: 'AI-optimized search engine — semantic search for high-quality results.',
    version: '1.0.0',
    author: 'Exa Labs',
    category: MarketplaceCategory.Search,
    tags: ['search', 'ai', 'semantic', 'web', 'api'],
    rating: 4.4,
    downloads: 4800,
    verified: true,
    homepage: 'https://exa.ai',
    repository: 'https://github.com/exa-labs/exa-mcp-server',
    installSource: 'marketplace',
    lastUpdated: '2024-12-25T10:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '🔍',
    mcpServer: { command: 'npx', args: ['-y', '@exa-labs/mcp-server'], env: {} },
    requiredEnvVars: ['EXA_API_KEY'],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Read, reason: 'Perform web searches' }],
  },
  {
    id: 'mkt-homeassistant',
    name: 'Home Assistant',
    description: 'Control smart home devices via Home Assistant — lights, sensors, automation.',
    version: '0.7.0',
    author: 'Community',
    category: MarketplaceCategory.Automation,
    tags: ['smart-home', 'iot', 'automation', 'home-assistant'],
    rating: 4.2,
    downloads: 2900,
    verified: false,
    homepage: 'https://home-assistant.io',
    repository: 'https://github.com/home-assistant/mcp-server',
    installSource: 'marketplace',
    lastUpdated: '2024-11-15T09:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '🏠',
    mcpServer: { command: 'npx', args: ['-y', '@homeassistant/mcp-server'], env: {} },
    requiredEnvVars: ['HOMEASSISTANT_URL', 'HOMEASSISTANT_TOKEN'],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Write, reason: 'Control smart home devices' }],
  },
  {
    id: 'mkt-discord',
    name: 'Discord',
    description: 'Interact with Discord servers — send messages, read channels, manage roles.',
    version: '0.9.0',
    author: 'Community',
    category: MarketplaceCategory.Communication,
    tags: ['discord', 'chat', 'messaging', 'gaming', 'community'],
    rating: 4.1,
    downloads: 4100,
    verified: false,
    homepage: 'https://discord.com',
    repository: 'https://github.com/discord-mcp/server',
    installSource: 'marketplace',
    lastUpdated: '2024-12-10T15:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '🎮',
    mcpServer: { command: 'npx', args: ['-y', '@discord-mcp/server'], env: {} },
    requiredEnvVars: ['DISCORD_BOT_TOKEN'],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Read, reason: 'Read and send Discord messages' }],
  },
  {
    id: 'mkt-cloudinary',
    name: 'Cloudinary',
    description: 'Media management — upload, transform, and optimize images and videos.',
    version: '1.0.0',
    author: 'Cloudinary Ltd.',
    category: MarketplaceCategory.Media,
    tags: ['media', 'images', 'video', 'cdn', 'optimization'],
    rating: 4.3,
    downloads: 3800,
    verified: true,
    homepage: 'https://cloudinary.com',
    repository: 'https://github.com/cloudinary/mcp-server',
    installSource: 'marketplace',
    lastUpdated: '2024-12-12T11:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '🖼️',
    mcpServer: { command: 'npx', args: ['-y', '@cloudinary/mcp-server'], env: {} },
    requiredEnvVars: ['CLOUDINARY_URL'],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Write, reason: 'Upload and manage media assets' }],
  },
  {
    id: 'mkt-fetch',
    name: 'Fetch',
    description: 'HTTP client — fetch URLs, download content, and interact with web APIs.',
    version: '1.0.0',
    author: 'MCP Official',
    category: MarketplaceCategory.Development,
    tags: ['http', 'fetch', 'api', 'web', 'download'],
    rating: 4.8,
    downloads: 18500,
    verified: true,
    homepage: 'https://modelcontextprotocol.io',
    repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
    installSource: 'marketplace',
    lastUpdated: '2025-01-13T08:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '🌐',
    mcpServer: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'], env: {} },
    requiredEnvVars: [],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Read, reason: 'Fetch content from the web' }],
  },
  {
    id: 'mkt-context7',
    name: 'Context7',
    description: 'Up-to-date code documentation for any library — always current, never stale.',
    version: '1.0.0',
    author: 'Context7',
    category: MarketplaceCategory.Development,
    tags: ['documentation', 'code', 'library', 'context', 'up-to-date'],
    rating: 4.6,
    downloads: 5600,
    verified: true,
    homepage: 'https://context7.com',
    repository: 'https://github.com/context7/mcp-server',
    installSource: 'marketplace',
    lastUpdated: '2025-01-14T12:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['win32', 'darwin', 'linux'] },
    icon: '📚',
    mcpServer: { command: 'npx', args: ['-y', '@context7/mcp-server'], env: {} },
    requiredEnvVars: [],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Read, reason: 'Fetch library documentation' }],
  },
  {
    id: 'mkt-cognee',
    name: 'Cognee',
    description: 'Graph-based memory and knowledge management for AI agents.',
    version: '0.9.0',
    author: 'Cognee Labs',
    category: MarketplaceCategory.Memory,
    tags: ['memory', 'knowledge', 'graph', 'cognitive', 'ai'],
    rating: 4.2,
    downloads: 2800,
    verified: false,
    homepage: 'https://cognee.ai',
    repository: 'https://github.com/cognee-ai/cognee-mcp-server',
    installSource: 'marketplace',
    lastUpdated: '2024-12-30T10:00:00Z',
    compatibility: { nodeVersion: '>=18.0.0', platforms: ['darwin', 'linux'] },
    icon: '🔗',
    mcpServer: { command: 'npx', args: ['-y', '@cognee/mcp-server'], env: {} },
    requiredEnvVars: ['COGNEE_API_KEY'],
    optionalEnvVars: [],
    permissions: [{ level: PermissionLevel.Write, reason: 'Store and retrieve knowledge graph data' }],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Extension Marketplace Class
// ─────────────────────────────────────────────────────────────────────────────

export class ExtensionMarketplace extends EventEmitter {
  private catalog: Map<string, MarketplaceExtension> = new Map();
  private installedIds: Set<string> = new Set();
  private ratings: Map<string, MarketplaceRating[]> = new Map();
  private reports: Map<string, MarketplaceReport[]> = new Map();

  constructor() {
    super();
    // Load catalog
    for (const ext of MARKETPLACE_CATALOG) {
      this.catalog.set(ext.id, ext);
    }
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  search(
    query?: string,
    category?: MarketplaceCategory,
    sortBy: SortField = 'rating',
  ): MarketplaceExtension[] {
    let results = Array.from(this.catalog.values());

    // Filter by category
    if (category) {
      results = results.filter((ext) => ext.category === category);
    }

    // Filter by search query
    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      results = results.filter((ext) => {
        const nameMatch = ext.name.toLowerCase().includes(q);
        const descMatch = ext.description.toLowerCase().includes(q);
        const tagMatch = ext.tags.some((t) => t.toLowerCase().includes(q));
        const authorMatch = ext.author.toLowerCase().includes(q);
        return nameMatch || descMatch || tagMatch || authorMatch;
      });
    }

    // Sort
    results = this.sortExtensions(results, sortBy);

    return results;
  }

  // ─── Featured ──────────────────────────────────────────────────────────────

  getFeatured(): MarketplaceExtension[] {
    // Featured = verified + high rating + high downloads
    return Array.from(this.catalog.values())
      .filter((ext) => ext.verified && ext.rating >= 4.5)
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, 8);
  }

  // ─── Categories ────────────────────────────────────────────────────────────

  getCategories(): { category: MarketplaceCategory; count: number; label: string }[] {
    const categoryLabels: Record<MarketplaceCategory, string> = {
      [MarketplaceCategory.Development]: 'Development',
      [MarketplaceCategory.Productivity]: 'Productivity',
      [MarketplaceCategory.Browser]: 'Browser',
      [MarketplaceCategory.Cloud]: 'Cloud',
      [MarketplaceCategory.Database]: 'Database',
      [MarketplaceCategory.Communication]: 'Communication',
      [MarketplaceCategory.Design]: 'Design',
      [MarketplaceCategory.Media]: 'Media',
      [MarketplaceCategory.Search]: 'Search',
      [MarketplaceCategory.Memory]: 'Memory',
      [MarketplaceCategory.System]: 'System',
      [MarketplaceCategory.Automation]: 'Automation',
    };

    const counts = new Map<MarketplaceCategory, number>();
    for (const ext of this.catalog.values()) {
      counts.set(ext.category, (counts.get(ext.category) || 0) + 1);
    }

    return Object.values(MarketplaceCategory).map((cat) => ({
      category: cat,
      count: counts.get(cat) || 0,
      label: categoryLabels[cat],
    }));
  }

  // ─── Install ───────────────────────────────────────────────────────────────

  async install(marketplaceId: string): Promise<ExtensionConfig> {
    const ext = this.catalog.get(marketplaceId);
    if (!ext) {
      throw new Error(`Extension not found in marketplace: ${marketplaceId}`);
    }

    // Check compatibility
    if (!this.checkCompatibility(ext)) {
      throw new Error(`Extension ${ext.name} is not compatible with your platform or Node.js version`);
    }

    this.emit('extension:installing', { id: marketplaceId, name: ext.name });

    try {
      // Build the extension config from marketplace entry
      const config: ExtensionConfig = {
        id: ext.id,
        type: this.mapToExtensionType(ext.id),
        name: ext.name,
        description: ext.description,
        version: ext.version,
        enabled: true,
        settings: {},
        mcpServer: ext.mcpServer,
        builtin: false,
        installedAt: new Date().toISOString(),
      };

      this.installedIds.add(marketplaceId);

      // Update download count
      ext.downloads += 1;

      this.emit('extension:installed', { id: marketplaceId, name: ext.name, config });

      return config;
    } catch (err) {
      this.emit('extension:install-error', {
        id: marketplaceId,
        name: ext.name,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  // ─── Uninstall ─────────────────────────────────────────────────────────────

  async uninstall(extensionId: string): Promise<void> {
    const ext = this.catalog.get(extensionId);
    if (!ext) {
      throw new Error(`Extension not found: ${extensionId}`);
    }

    this.emit('extension:uninstalling', { id: extensionId, name: ext.name });

    this.installedIds.delete(extensionId);

    this.emit('extension:uninstalled', { id: extensionId, name: ext.name });
  }

  // ─── Rate ──────────────────────────────────────────────────────────────────

  rate(extensionId: string, rating: number, userId = 'default', comment?: string): void {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    const ext = this.catalog.get(extensionId);
    if (!ext) {
      throw new Error(`Extension not found: ${extensionId}`);
    }

    const ratingEntry: MarketplaceRating = {
      extensionId,
      userId,
      rating,
      comment,
      timestamp: new Date().toISOString(),
    };

    const existing = this.ratings.get(extensionId) || [];

    // Update or add rating
    const existingIdx = existing.findIndex((r) => r.userId === userId);
    if (existingIdx >= 0) {
      existing[existingIdx] = ratingEntry;
    } else {
      existing.push(ratingEntry);
    }

    this.ratings.set(extensionId, existing);

    // Recalculate average rating
    const avg = existing.reduce((sum, r) => sum + r.rating, 0) / existing.length;
    ext.rating = Math.round(avg * 10) / 10;

    this.emit('extension:rated', { id: extensionId, rating, averageRating: ext.rating });
  }

  // ─── Report ────────────────────────────────────────────────────────────────

  report(extensionId: string, reason: string, reporterId = 'default', details?: string): void {
    const ext = this.catalog.get(extensionId);
    if (!ext) {
      throw new Error(`Extension not found: ${extensionId}`);
    }

    const report: MarketplaceReport = {
      extensionId,
      reporterId,
      reason,
      details,
      timestamp: new Date().toISOString(),
    };

    const existing = this.reports.get(extensionId) || [];
    existing.push(report);
    this.reports.set(extensionId, existing);

    // Auto-unverify if too many reports
    if (existing.length >= 5) {
      ext.verified = false;
    }

    this.emit('extension:reported', { id: extensionId, reason, reportCount: existing.length });
  }

  // ─── Get by ID ─────────────────────────────────────────────────────────────

  get(marketplaceId: string): MarketplaceExtension | undefined {
    return this.catalog.get(marketplaceId);
  }

  // ─── List installed ────────────────────────────────────────────────────────

  listInstalled(): MarketplaceExtension[] {
    return Array.from(this.catalog.values()).filter((ext) => this.installedIds.has(ext.id));
  }

  // ─── Get ratings ───────────────────────────────────────────────────────────

  getRatings(extensionId: string): MarketplaceRating[] {
    return this.ratings.get(extensionId) || [];
  }

  // ─── Get reports ───────────────────────────────────────────────────────────

  getReports(extensionId: string): MarketplaceReport[] {
    return this.reports.get(extensionId) || [];
  }

  // ─── Mark installed (sync from registry) ───────────────────────────────────

  markInstalled(extensionId: string): void {
    this.installedIds.add(extensionId);
  }

  markUninstalled(extensionId: string): void {
    this.installedIds.delete(extensionId);
  }

  // ─── Compatibility check ───────────────────────────────────────────────────

  checkCompatibility(ext: MarketplaceExtension): boolean {
    // Check platform
    const currentPlatform = os.platform() as 'win32' | 'darwin' | 'linux';
    if (!ext.compatibility.platforms.includes(currentPlatform)) {
      return false;
    }

    // Check Node.js version
    const nodeVersion = process.version; // e.g. "v20.11.0"
    const requiredVersion = ext.compatibility.nodeVersion; // e.g. ">=18.0.0"
    if (!this.satisfiesNodeVersion(nodeVersion, requiredVersion)) {
      return false;
    }

    return true;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private sortExtensions(extensions: MarketplaceExtension[], sortBy: SortField): MarketplaceExtension[] {
    return [...extensions].sort((a, b) => {
      switch (sortBy) {
        case 'rating':
          return b.rating - a.rating;
        case 'downloads':
          return b.downloads - a.downloads;
        case 'name':
          return a.name.localeCompare(b.name);
        case 'lastUpdated':
          return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
        default:
          return 0;
      }
    });
  }

  private satisfiesNodeVersion(current: string, required: string): boolean {
    const currentMajor = parseInt(current.replace('v', '').split('.')[0], 10);
    const match = required.match(/>=?(\d+)/);
    if (!match) return true;
    const requiredMajor = parseInt(match[1], 10);
    return currentMajor >= requiredMajor;
  }

  private mapToExtensionType(marketplaceId: string): ExtensionType {
    // Map marketplace IDs to ExtensionType enum values
    const mapping: Record<string, ExtensionType> = {
      'mkt-github': ExtensionType.GitHub,
      'mkt-playwright': ExtensionType.Playwright,
      'mkt-postgres': ExtensionType.Postgres,
      'mkt-slack': ExtensionType.Slack,
      'mkt-figma': ExtensionType.Figma,
      'mkt-filesystem': ExtensionType.Filesystem,
      'mkt-brave-search': ExtensionType.BraveSearch,
      'mkt-memory': ExtensionType.KnowledgeGraphMemory,
      'mkt-aws': ExtensionType.AWS,
      'mkt-docker': ExtensionType.Docker,
      'mkt-notion': ExtensionType.Notion,
      'mkt-linear': ExtensionType.Linear,
      'mkt-redis': ExtensionType.Redis,
      'mkt-firecrawl': ExtensionType.Firecrawl,
      'mkt-spotify': ExtensionType.Spotify,
      'mkt-elevenlabs': ExtensionType.ElevenLabs,
      'mkt-vercel': ExtensionType.Vercel,
      'mkt-supabase': ExtensionType.Supabase,
      'mkt-exa-search': ExtensionType.ExaSearch,
      'mkt-homeassistant': ExtensionType.HomeAssistant,
      'mkt-discord': ExtensionType.Discord,
      'mkt-cloudinary': ExtensionType.Cloudinary,
      'mkt-fetch': ExtensionType.Fetch,
      'mkt-context7': ExtensionType.Context7,
      'mkt-cognee': ExtensionType.Cognee,
    };
    return mapping[marketplaceId] || ExtensionType.Fetch;
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let marketplaceInstance: ExtensionMarketplace | null = null;

export function getMarketplace(): ExtensionMarketplace {
  if (!marketplaceInstance) {
    marketplaceInstance = new ExtensionMarketplace();
  }
  return marketplaceInstance;
}

export function resetMarketplace(): void {
  marketplaceInstance = null;
}
