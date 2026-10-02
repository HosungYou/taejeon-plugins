import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function run(change) {
  const root = mkdtempSync(join(tmpdir(), 'taejeon-plugin-check-'));
  try {
    for (const path of ['.agents', 'plugins']) cpSync(join(repo, path), join(root, path), { recursive: true });
    const edit = (path, fn) => { const p = join(root, path); const data = JSON.parse(readFileSync(p)); fn(data); writeFileSync(p, JSON.stringify(data)); };
    change?.({ root, edit });
    return spawnSync(process.execPath, [join(repo, 'scripts/validate-plugin.mjs'), root], { encoding: 'utf8' });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test('accepts the reviewed HTTP-only package', () => assert.equal(run().status, 0));
test('accepts only the bounded text extraction skill without executable companions',()=>{
 assert.equal(run(({root})=>{
  const path=join(root,'plugins/taejeon-core/skills/erp-extraction');mkdirSync(path,{recursive:true});
  writeFileSync(join(path,'SKILL.md'),'---\nname: erp-extraction\ndescription: Read permission-scoped ERP data.\n---\nRead data only.');
 }).status,0);
});
const mutations = {
  'different endpoint': ({ edit }) => edit('plugins/taejeon-core/mcp.json', d => { d.mcpServers['taejeon-core'].url = 'https://untrusted.invalid/mcp'; }),
  'embedded authorization': ({ edit }) => edit('plugins/taejeon-core/.mcp.json', d => { d.mcpServers['taejeon-core'].headers = { Authorization: 'Bearer example' }; }),
  'local command': ({ edit }) => edit('plugins/taejeon-core/mcp.json', d => { d.mcpServers['taejeon-core'].command = 'sh'; }),
  'extra server': ({ edit }) => edit('plugins/taejeon-core/.mcp.json', d => { d.mcpServers.extra = { type: 'http', url: 'https://untrusted.invalid' }; }),
  'redirected marketplace path': ({ edit }) => edit('.agents/plugins/marketplace.json', d => { d.plugins[0].source.path = '../other'; }),
  'mismatched version': ({ edit }) => edit('plugins/taejeon-core/plugin.json', d => { d.version = '9.9.9'; }),
  'write capability': ({ edit }) => edit('plugins/taejeon-core/plugin.json', d => { d.extensions['com.openai'].interface.capabilities.push('Write'); }),
  'new hook file': ({ root }) => { mkdirSync(join(root, 'plugins/taejeon-core/hooks')); writeFileSync(join(root, 'plugins/taejeon-core/hooks/run.sh'), 'echo example'); },
  'symlinked asset': ({ root }) => symlinkSync('/etc/hosts', join(root, 'plugins/taejeon-core/extra')),
  'new plugin folder': ({ root }) => mkdirSync(join(root, 'plugins/extra')),
  'executable skill companion': ({root})=>{const path=join(root,'plugins/taejeon-core/skills/erp-extraction');mkdirSync(path,{recursive:true});writeFileSync(join(path,'run.mjs'),'process.exit(0)');},
};
for (const [name, change] of Object.entries(mutations)) test(`rejects ${name}`, () => assert.notEqual(run(change).status, 0));
