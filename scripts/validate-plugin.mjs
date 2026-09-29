import assert from 'node:assert/strict';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

// Deliberately narrow: changing executable capabilities or destinations requires
// reviewing this policy as well as the manifests. No third-party dependencies.
const root = resolve(process.argv[2] ?? '.');
const endpoint = 'https://taejeon-core-llm-mvp.vercel.app/api/mcp';
const homepage = 'https://github.com/HosungYou/taejeon-plugins';
const allowedFiles = new Set([
  '.agents/plugins/marketplace.json',
  'plugins/taejeon-core/plugin.json',
  'plugins/taejeon-core/.codex-plugin/plugin.json',
  'plugins/taejeon-core/mcp.json',
  'plugins/taejeon-core/.mcp.json',
]);
const allowedDirs = new Set(['.agents', '.agents/plugins', 'plugins', 'plugins/taejeon-core', 'plugins/taejeon-core/.codex-plugin']);
function walk(path) {
  const rel = relative(root, path).split('\\').join('/');
  const stat = lstatSync(path);
  assert(!stat.isSymbolicLink(), `symlink prohibited: ${rel}`);
  if (stat.isDirectory()) {
    assert(allowedDirs.has(rel), `unexpected package directory: ${rel}`);
    for (const entry of readdirSync(path)) walk(join(path, entry));
  } else {
    assert(stat.isFile() && allowedFiles.has(rel), `unexpected package file: ${rel}`);
    assert(stat.size <= 65536, `manifest too large: ${rel}`);
  }
}
function keys(obj, expected, label) {
  assert(obj && typeof obj === 'object' && !Array.isArray(obj), `${label} must be an object`);
  assert.deepEqual(Object.keys(obj).sort(), [...expected].sort(), `unexpected keys: ${label}`);
}
function json(path) { return JSON.parse(readFileSync(join(root, path), 'utf8')); }

try {
  walk(join(root, '.agents'));
  walk(join(root, 'plugins'));
  for (const path of allowedFiles) assert(lstatSync(join(root, path)).isFile(), `missing manifest: ${path}`);
  const market = json('.agents/plugins/marketplace.json');
  assert.deepEqual(market, {
    name: 'taejeon', interface: { displayName: '태전 Core' },
    plugins: [{ name: 'taejeon-core', source: { source: 'local', path: './plugins/taejeon-core' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }],
  }, 'marketplace source or install/authentication policy changed');
  const current = json('plugins/taejeon-core/plugin.json');
  const legacy = json('plugins/taejeon-core/.codex-plugin/plugin.json');
  keys(current, ['$schema', 'name', 'version', 'description', 'author', 'homepage', 'repository', 'extensions'], 'plugin');
  keys(legacy, ['name', 'version', 'description', 'author', 'homepage', 'repository', 'interface', 'mcpServers'], 'legacy plugin');
  assert.equal(current.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.match(current.version, /^\d+\.\d+\.\d+$/);
  for (const key of ['name', 'version', 'description', 'author', 'homepage', 'repository']) assert.deepEqual(current[key], legacy[key], `format drift: ${key}`);
  assert.equal(current.name, 'taejeon-core');
  assert.equal(current.homepage, homepage);
  assert.equal(current.repository, homepage);
  assert.equal(legacy.mcpServers, './.mcp.json');
  keys(current.extensions, ['com.openai'], 'extensions');
  keys(current.extensions['com.openai'], ['interface'], 'OpenAI extension');
  const ui = current.extensions['com.openai'].interface;
  keys(ui, ['displayName', 'shortDescription', 'longDescription', 'developerName', 'category', 'capabilities', 'websiteURL', 'defaultPrompt'], 'interface');
  assert.deepEqual(ui, legacy.interface, 'interface format drift');
  assert.deepEqual(ui.capabilities, ['Read']);
  assert.equal(ui.websiteURL, 'https://taejeon-core-llm-mvp.vercel.app/me/mcp');
  assert(Array.isArray(ui.defaultPrompt) && ui.defaultPrompt.every(p => typeof p === 'string'), 'invalid prompts');
  for (const [path, type] of [['mcp.json', 'streamable-http'], ['.mcp.json', 'http']]) {
    const mcp = json(`plugins/taejeon-core/${path}`);
    keys(mcp, path === 'mcp.json' ? ['$schema', 'mcpServers'] : ['mcpServers'], path);
    if (path === 'mcp.json') assert.equal(mcp.$schema, 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');
    keys(mcp.mcpServers, ['taejeon-core'], `${path} servers`);
    assert.deepEqual(mcp.mcpServers['taejeon-core'], { type, url: endpoint }, `${path}: only the approved HTTP endpoint is allowed (no commands, headers, env or tokens)`);
  }
  console.log('PASS: approved HTTP endpoint, no executable package files or embedded authentication, matching manifests');
} catch (error) {
  // Do not print manifest values: a rejected field could contain a credential.
  console.error(`Plugin validation failed: ${error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'invalid or missing manifest'}`);
  process.exitCode = 1;
}
