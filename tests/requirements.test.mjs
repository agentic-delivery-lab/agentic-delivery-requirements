import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, cp, rm, writeFile, symlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { validateCatalogs, validateBaseline, contentDigest, readYaml } from '../tools/validate-requirements.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const approval = { actor: 'sjefsharp', decisionReference: 'https://github.com/agentic-delivery-lab/agentic-delivery-requirements/pull/1', approvedAt: '2026-10-13' };
function requirement() {
  return {
    id: 'FR-001', owner: 'sjefsharp', scopeIds: ['factory'], status: 'proposed',
    statement: 'Retain the originating repository identity through delivery.',
    source: { issue: 'https://github.com/agentic-delivery-lab/agentic-delivery/issues/59', repository: 'agentic-delivery-lab/agentic-delivery', sourceCommit: '9a2e1f3549428bc042d5c59d09beb300ca2d1362', path: 'scripts/codex-delivery.mjs', sha256: 'a'.repeat(64) },
    verification: { criterion: 'No mutation targets another repository.', evidenceStatus: 'unverified', evidence: [] },
  };
}
const scopes = { schemaVersion: 1, scopes: [{ id: 'factory', kind: 'factory', repositoryIds: [1358455028] }] };
const catalog = (records) => ({ schemaVersion: 1, catalogId: 'factory', requirements: records });

async function fixture(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'requirements-test-'));
  try {
    for (const entry of ['AGENTS.md', 'README.md', 'contracts', 'requirements', 'manifests']) await cp(path.join(root, entry), path.join(directory, entry), { recursive: true });
    execFileSync('git', ['init', '-q', '--initial-branch=main', directory]);
    execFileSync('git', ['-C', directory, 'add', '.']);
    execFileSync('git', ['-C', directory, '-c', 'user.name=Requirements test', '-c', 'user.email=requirements-test@example.invalid', 'commit', '-qm', 'Fixture source']);
    const file = path.join(directory, 'manifests/requirements-release.json');
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    manifest.sourceCommit = execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    manifest.contentSha256 = await contentDigest(directory, manifest.sourceCommit);
    await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
    return await run(directory, manifest);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test('proposed records remain non-normative and validation leaves data unchanged', async () => {
  const record = requirement();
  const before = structuredClone(record);
  const result = await validateCatalogs(root, { scopes, catalogs: [catalog([record])] });
  assert.deepEqual(result.approvedRequirementIds, []);
  assert.deepEqual(record, before);
});

test('approved requirements require accountable acceptance without implying satisfaction', async () => {
  const record = { ...requirement(), status: 'approved', approval };
  const result = await validateCatalogs(root, { scopes, catalogs: [catalog([record])] });
  assert.deepEqual(result.approvedRequirementIds, ['FR-001']);
  assert.equal(record.verification.evidenceStatus, 'unverified');
  delete record.approval;
  await assert.rejects(validateCatalogs(root, { scopes, catalogs: [catalog([record])] }), /approval/);
});

test('duplicate IDs across catalogs and unknown scopes cannot define a baseline', async () => {
  await assert.rejects(validateCatalogs(root, { scopes, catalogs: [catalog([requirement()]), { ...catalog([requirement()]), catalogId: 'another' }] }), /duplicate requirement/);
  await assert.rejects(validateCatalogs(root, { scopes, catalogs: [catalog([{ ...requirement(), scopeIds: ['unknown'] }])] }), /unknown scope/);
});

test('closed contracts reject missing ownership, moving sources, unsafe paths and unsupported versions', async () => {
  for (const mutate of [
    record => { delete record.owner; },
    record => { record.source.sourceCommit = 'main'; },
    record => { record.source.path = '../secret'; },
    record => { record.unapprovedShellCommand = 'execute'; },
  ]) {
    const record = requirement(); mutate(record);
    await assert.rejects(validateCatalogs(root, { scopes, catalogs: [catalog([record])] }));
  }
  await assert.rejects(validateCatalogs(root, { scopes, catalogs: [{ ...catalog([]), schemaVersion: 2 }] }), /schemaVersion/);
});

test('YAML rejects duplicate keys and alias expansion', () => {
  assert.throws(() => readYaml('schemaVersion: 1\nschemaVersion: 2\n'), /unique|duplicate/i);
  assert.throws(() => readYaml('x: &value [a]\ny: *value\n'), /alias/i);
});

test('draft baseline reproduces its exact source and cannot masquerade as approved', async () => fixture(async (directory, manifest) => {
  const result = await validateBaseline(directory);
  await assert.rejects(validateBaseline(directory, { requireApproved: true }), /approved baseline/);
  await assert.rejects(validateBaseline(directory, { expectedRepositoryId: manifest.repositoryId + 1 }), /identity mismatch/);
  assert.equal(result.status, 'draft');
  assert.deepEqual(result.approvedRequirementIds, []);
  manifest.status = 'approved';
  await writeFile(path.join(directory, 'manifests/requirements-release.json'), JSON.stringify(manifest));
  await assert.rejects(validateBaseline(directory), /approval|non-empty|approved/i);
}));

test('tampered requirements and altered source identity fail exact baseline validation', async () => fixture(async (directory, manifest) => {
  await writeFile(path.join(directory, 'requirements/factory.yml'), 'schemaVersion: 1\ncatalogId: factory\nrequirements: []\n# changed\n');
  await assert.rejects(validateBaseline(directory), /digest/);
  manifest.sourceRepository = 'agentic-delivery-lab/untrusted';
  await writeFile(path.join(directory, 'manifests/requirements-release.json'), JSON.stringify(manifest));
  await assert.rejects(validateBaseline(directory), /sourceRepository/);
}));

test('uncatalogued files cannot be silently omitted from requirement coverage', async () => fixture(async (directory) => {
  await writeFile(path.join(directory, 'requirements/products/unknown.yml'), 'schemaVersion: 1\ncatalogId: unknown\nrequirements: []\n');
  await assert.rejects(validateBaseline(directory), /catalog.*coverage/i);
}));

test('authority decision pins remain covered even when manifest fields are reordered', async () => fixture(async (directory, manifest) => {
  const changed = { authorityDecision: { ...manifest.authorityDecision, sourceCommit: 'b'.repeat(40) }, ...manifest };
  changed.authorityDecision.sourceCommit = 'b'.repeat(40);
  await writeFile(path.join(directory, 'manifests/requirements-release.json'), JSON.stringify(changed));
  await assert.rejects(validateBaseline(directory), /digest/);
}));

test('an ancestor symlink cannot redirect schema reads outside declared inputs', async () => fixture(async (directory) => {
  const outside = await mkdtemp(path.join(os.tmpdir(), 'requirements-outside-'));
  try {
    await cp(path.join(directory, 'contracts'), outside, { recursive: true });
    await rm(path.join(directory, 'contracts'), { recursive: true });
    await symlink(outside, path.join(directory, 'contracts'));
    await assert.rejects(validateBaseline(directory), /Symlink/);
  } finally { await rm(outside, { recursive: true, force: true }); }
}));

test('the baseline cannot select proposed or withdrawn IDs as approved', async () => fixture(async (directory, manifest) => {
  manifest.approvedRequirementIds = ['FR-001'];
  await writeFile(path.join(directory, 'manifests/requirements-release.json'), JSON.stringify(manifest));
  await assert.rejects(validateBaseline(directory), /Approved IDs must exactly cover/);
  const record = { ...requirement(), status: 'withdrawn', withdrawal: approval };
  const result = await validateCatalogs(root, { scopes, catalogs: [catalog([record])] });
  assert.deepEqual(result.approvedRequirementIds, []);
}));

test('catalog paths cannot escape declared inputs and JSON duplicate keys are rejected', async () => fixture(async (directory, manifest) => {
  const file = path.join(directory, 'manifests/requirements-release.json');
  manifest.catalogPaths = ['../secret.yml'];
  await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(validateBaseline(directory), /catalogPaths/);
  const original = JSON.stringify({ ...manifest, catalogPaths: ['requirements/factory.yml'] });
  await writeFile(file, original.replace('{', '{"status":"draft",'));
  await assert.rejects(validateBaseline(directory), /unique|duplicate/i);
}));

test('a verified satisfaction claim requires evidence independently of approval', async () => {
  const record = requirement();
  record.verification.evidenceStatus = 'verified';
  await assert.rejects(validateCatalogs(root, { scopes, catalogs: [catalog([record])] }), /evidence/);
});
