import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentDigest } from './validate-requirements.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'manifests/requirements-release.json');
try {
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  if (manifest.status !== 'draft') throw new Error('Prepare only an explicitly draft baseline; approved/withdrawn baselines require a new reviewed candidate');
  const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const digest = await contentDigest(root, commit);
  if (digest !== await contentDigest(root, 'WORKTREE')) throw new Error('Commit authoritative candidate changes before preparing baseline pins');
  manifest.sourceCommit = commit;
  manifest.contentSha256 = digest;
  await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ sourceCommit: commit, contentSha256: digest, status: manifest.status }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
