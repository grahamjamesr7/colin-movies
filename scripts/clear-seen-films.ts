import { execSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const TMP = '/tmp/colin-movies-kv-keys.json';

// read the KV binding name from wrangler config
const configPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'wrangler.jsonc');
const configText = readFileSync(configPath, 'utf8')
	.replace(/\/\/.*$/gm, '')
	.replace(/\/\*[\s\S]*?\*\//g, '')
	.replace(/,\s*([}\]])/g, '$1');
const config = JSON.parse(configText);
const binding: string = config.kv_namespaces[0].binding;

const raw = execSync(`npx wrangler kv key list --binding=${binding}`, { encoding: 'utf8' });
const keys: { name: string }[] = JSON.parse(raw);

if (keys.length === 0) {
	console.log('No keys in KV -- nothing to delete.');
	process.exit(0);
}

console.log(`Found ${keys.length} key(s) to delete:`);
for (const k of keys) console.log(`  ${k.name}`);

const names = keys.map((k) => k.name);
writeFileSync(TMP, JSON.stringify(names));

try {
	execSync(`npx wrangler kv bulk delete ${TMP} --binding=${binding}`, {
		stdio: 'inherit',
	});
} finally {
	unlinkSync(TMP);
}
