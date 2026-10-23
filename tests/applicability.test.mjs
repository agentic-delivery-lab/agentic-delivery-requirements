import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { cp, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { buildApplicabilityIndex, selectApplicableRequirements, contentDigest, readYaml } from '../tools/validate-requirements.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const pin = {
  repository: 'agentic-delivery-lab/agentic-delivery-requirements', repositoryId: 1416207421,
  commit: '9ce017453a23240042f72214b09e3c6c5059854d', version: '1.0.0',
  contentSha256: 'eec84e8ff2b276ef322b9262ede31edad9f4c0f9f30a7527a9607dd9f411a1c4',
};
const consumers = [1358455028, 1368850419, 1380894616, 1380894656, 1380894705, 1380894756, 1416207421];
const approved = ['QR-001', 'QR-002', 'QR-003', 'QR-004', 'QR-005', 'QR-006', 'QR-007', 'QR-008', 'QR-010', 'QR-011', 'QR-012', 'QR-013', 'QR-014', 'QR-015', 'QR-016', 'QR-017', 'QR-018', 'QR-019'];

async function fixture(t, mutate = async () => {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'requirements-applicability-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const entry of ['AGENTS.md', 'README.md', 'requirements', 'contracts', 'manifests']) {
    await cp(path.join(root, entry), path.join(directory, entry), { recursive: true });
  }
  const file = path.join(directory, 'manifests/requirements-release.json');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.approval = { actor: 'synthetic-fixture', decisionReference: 'https://example.invalid/requirements-fixture', approvedAt: '2026-01-01' };
  await mutate(directory, manifest);
  await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
  const git = (...args) => execFileSync('git', ['-C', directory, '-c', 'user.name=Synthetic fixture', '-c', 'user.email=fixture@example.invalid', ...args], { encoding: 'utf8' }).trim();
  git('init', '-q', '--initial-branch=main');
  git('add', '.'); git('commit', '-qm', 'Synthetic source');
  manifest.sourceCommit = git('rev-parse', 'HEAD');
  manifest.contentSha256 = await contentDigest(directory, manifest.sourceCommit);
  await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
  git('add', '.'); git('commit', '-qm', 'Synthetic baseline binding');
  return { directory, git, pin: { ...pin, commit: git('rev-parse', 'HEAD'), contentSha256: manifest.contentSha256 } };
}

test('the accepted baseline derives exactly seven explicit consumers and only approved references', async () => {
  const index = await buildApplicabilityIndex(root, pin);
  assert.equal(index.schemaVersion, 1);
  assert.deepEqual(index.authority, { ...pin, sourceCommit: '059aad42e0e3e4b8e305f46a1d474a12ffdb8f33' });
  assert.deepEqual(index.repositories.map(row => row.repositoryId), consumers);
  for (const consumer of index.repositories) {
    assert.deepEqual(consumer.scopeIds, ['factory']);
    assert.deepEqual(consumer.requirements, approved.map(id => ({ id, catalogPath: 'requirements/factory.yml', scopeIds: ['factory'] })));
  }
  assert.equal(JSON.stringify(index), JSON.stringify(await buildApplicabilityIndex(root, pin)));
  const selected = await selectApplicableRequirements(root, pin, 1380894656);
  assert.deepEqual(selected, { schemaVersion: 1, authority: index.authority, ...index.repositories[3] });
});

test('unknown consumers and moving, mismatched or incomplete authority pins fail closed', async () => {
  for (const repositoryId of [999999999, 0, -1, '1380894656', undefined]) {
    await assert.rejects(selectApplicableRequirements(root, pin, repositoryId), /applicability|repository ID/i);
  }
  for (const mutation of [
    { commit: 'main' }, { repositoryId: 1380894656 }, { repository: 'untrusted/requirements' },
    { version: '2.0.0' }, { contentSha256: 'a'.repeat(64) }, { commit: undefined },
  ]) await assert.rejects(buildApplicabilityIndex(root, { ...pin, ...mutation }), /pin|identity|digest|version/i);
});

test('the baseline selector requires an actual commit rather than an annotated tag object', async (t) => {
  const f = await fixture(t);
  f.git('tag', '-a', 'synthetic-tag', '-m', 'Synthetic tag');
  await assert.rejects(buildApplicabilityIndex(f.directory, { ...f.pin, commit: f.git('rev-parse', 'refs/tags/synthetic-tag') }), /commit/i);
});

test('synthetic factory, shared and product scopes select explicit unions without draft or withdrawn records', async (t) => {
  const f = await fixture(t, async (directory, manifest) => {
    await writeFile(path.join(directory, 'requirements/scopes.yml'), JSON.stringify({ schemaVersion: 1, scopes: [
      { id: 'factory', kind: 'factory', repositoryIds: [101, 102] },
      { id: 'shared', kind: 'shared', repositoryIds: [102] },
      { id: 'product', kind: 'product', repositoryIds: [103], productId: 'synthetic-product' },
    ] }));
    const source = readYaml(await readFile(path.join(directory, 'requirements/factory.yml'), 'utf8')).requirements[0];
    const record = (id, scopeIds) => ({ ...structuredClone(source), id, scopeIds, approval: manifest.approval });
    const proposed = { ...record('FR-001', ['factory', 'shared', 'product']), status: 'proposed' };
    delete proposed.approval;
    const withdrawn = { ...record('SH-002', ['shared']), status: 'withdrawn', withdrawal: manifest.approval };
    delete withdrawn.approval;
    await writeFile(path.join(directory, 'requirements/factory.yml'), JSON.stringify({ schemaVersion: 1, catalogId: 'factory', requirements: [
      record('SH-001', ['shared', 'factory']), proposed, record('QR-001', ['factory']), withdrawn,
    ] }));
    await writeFile(path.join(directory, 'requirements/products/synthetic.yml'), JSON.stringify({
      schemaVersion: 1, catalogId: 'synthetic-product', requirements: [record('PR-001', ['product'])],
    }));
    manifest.catalogPaths = ['requirements/products/synthetic.yml', 'requirements/factory.yml'];
    manifest.approvedRequirementIds = ['PR-001', 'QR-001', 'SH-001'];
  });
  const index = await buildApplicabilityIndex(f.directory, f.pin);
  assert.deepEqual(index.repositories, [
    { repositoryId: 101, scopeIds: ['factory'], requirements: [
      { id: 'QR-001', catalogPath: 'requirements/factory.yml', scopeIds: ['factory'] },
      { id: 'SH-001', catalogPath: 'requirements/factory.yml', scopeIds: ['factory'] },
    ] },
    { repositoryId: 102, scopeIds: ['factory', 'shared'], requirements: [
      { id: 'QR-001', catalogPath: 'requirements/factory.yml', scopeIds: ['factory'] },
      { id: 'SH-001', catalogPath: 'requirements/factory.yml', scopeIds: ['factory', 'shared'] },
    ] },
    { repositoryId: 103, scopeIds: ['product'], requirements: [
      { id: 'PR-001', catalogPath: 'requirements/products/synthetic.yml', scopeIds: ['product'] },
    ] },
  ]);
  await assert.rejects(selectApplicableRequirements(f.directory, f.pin, 104), /Unknown repository applicability/);
  await writeFile(path.join(f.directory, 'requirements/factory.yml'), 'uncommitted: invalid candidate\n');
  assert.deepEqual(await buildApplicabilityIndex(f.directory, f.pin), index);
  f.git('add', '.'); f.git('commit', '-qm', 'Synthetic unrelated candidate');
  f.git('replace', f.pin.commit, f.git('rev-parse', 'HEAD'));
  assert.deepEqual(await buildApplicabilityIndex(f.directory, f.pin), index);
});

test('draft and withdrawn baselines and an unknown declared scope cannot supply an index', async (t) => {
  for (const status of ['draft', 'withdrawn']) {
    const f = await fixture(t, async (_directory, manifest) => {
      manifest.status = status;
      if (status === 'withdrawn') manifest.withdrawal = manifest.approval;
      delete manifest.approval;
    });
    await assert.rejects(buildApplicabilityIndex(f.directory, f.pin), /approved baseline/);
  }
  const unknown = await fixture(t, async (directory) => {
    const file = path.join(directory, 'requirements/factory.yml');
    const catalog = readYaml(await readFile(file, 'utf8'));
    catalog.requirements[0].scopeIds = ['undeclared'];
    await writeFile(file, JSON.stringify(catalog));
  });
  await assert.rejects(buildApplicabilityIndex(unknown.directory, unknown.pin), /unknown scope/);
});

test('scope identities outside exact JavaScript integer range cannot enter the reference index', async (t) => {
  const f = await fixture(t, async (directory) => {
    const file = path.join(directory, 'requirements/scopes.yml');
    const scopes = readYaml(await readFile(file, 'utf8'));
    scopes.scopes[0].repositoryIds = [Number.MAX_SAFE_INTEGER + 1];
    await writeFile(file, JSON.stringify(scopes));
  });
  await assert.rejects(buildApplicabilityIndex(f.directory, f.pin), /safe native repository IDs/);
});

test('prepared source provenance must also identify a commit object', async (t) => {
  const f = await fixture(t);
  f.git('tag', '-a', 'synthetic-source', f.git('rev-parse', `${f.pin.commit}^`), '-m', 'Synthetic source tag');
  const file = path.join(f.directory, 'manifests/requirements-release.json');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.sourceCommit = f.git('rev-parse', 'refs/tags/synthetic-source');
  await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
  f.git('add', '.'); f.git('commit', '-qm', 'Synthetic tag provenance');
  await assert.rejects(buildApplicabilityIndex(f.directory, { ...f.pin, commit: f.git('rev-parse', 'HEAD') }), /source.*commit/i);
});

test('the required factory catalog cannot be omitted from an otherwise pinned baseline', async (t) => {
  const f = await fixture(t, async (directory, manifest) => {
    await rename(path.join(directory, 'requirements/factory.yml'), path.join(directory, 'requirements/products/synthetic.yml'));
    manifest.catalogPaths = ['requirements/products/synthetic.yml'];
  });
  await assert.rejects(buildApplicabilityIndex(f.directory, f.pin), /factory catalog/);
});
