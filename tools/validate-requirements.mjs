import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parseDocument } from 'yaml';

const gitAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = 'manifests/requirements-release.json';
const roots = ['AGENTS.md', 'README.md', 'requirements', 'contracts', 'manifests'];
const immutable = /^[0-9a-f]{40}$/;
const limit = 1024 * 1024;

export function readYaml(source) {
  const document = parseDocument(source, { version: '1.2', schema: 'core', customTags: [], resolveKnownTags: false, merge: false, strict: true, uniqueKeys: true });
  const diagnostics = [...document.errors, ...document.warnings];
  if (diagnostics.length) throw new Error(diagnostics[0].message);
  return document.toJS({ maxAliasCount: 0 });
}

function readJson(data) {
  const text = data.toString('utf8');
  JSON.parse(text); // Require JSON syntax as well as unique keys.
  return readYaml(text);
}

async function sourceFile(directory, file) {
  const location = path.join(directory, file);
  let parent = directory;
  for (const part of file.split('/')) {
    parent = path.join(parent, part);
    if ((await lstat(parent)).isSymbolicLink()) throw new Error(`Symlink is not a declared input: ${file}`);
  }
  if (!(await lstat(location)).isFile()) throw new Error(`Expected regular declared input: ${file}`);
  const data = await readFile(location);
  if (data.length > limit) throw new Error(`Input exceeds 1 MiB: ${file}`);
  return data;
}
async function git(directory, args) {
  return (await gitAsync('git', ['--no-lazy-fetch', '--no-replace-objects', '-C', directory, ...args], {
    encoding: 'buffer', maxBuffer: 32 * 1024 * 1024,
  })).stdout;
}
async function schemas(directory) {
  const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
  addFormats(ajv);
  const records = JSON.parse(await sourceFile(directory, 'contracts/requirements.schema.json'));
  const baseline = JSON.parse(await sourceFile(directory, 'contracts/requirements-release.schema.json'));
  for (const schema of [records, baseline]) {
    if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema' || !ajv.validateSchema(schema)) throw new Error('Invalid Draft 2020-12 contract');
    ajv.addSchema(schema);
  }
  return { catalog: ajv.getSchema(records.$id), scopes: ajv.getSchema(`${records.$id}#/$defs/scopes`), baseline: ajv.getSchema(baseline.$id) };
}
function check(validate, value, label) {
  if (!validate(value)) throw new Error(`${label}: ${validate.errors.map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')}`);
}

async function declaredFiles(directory, folder = '', result = []) {
  const entries = folder ? await readdir(path.join(directory, folder), { withFileTypes: true }) : roots.map(name => ({ name }));
  for (const entry of entries) {
    const file = folder ? `${folder}/${entry.name}` : entry.name;
    const stat = await lstat(path.join(directory, file));
    if (stat.isSymbolicLink()) throw new Error(`Symlink is not a declared input: ${file}`);
    if (stat.isDirectory()) await declaredFiles(directory, file, result);
    else if (stat.isFile()) result.push(file);
    else throw new Error(`Unsupported declared input: ${file}`);
  }
  return result.sort();
}

export async function validateCatalogs(directory = root, options = {}) {
  const validators = await schemas(directory);
  const scopeData = options.scopes ?? readYaml((await sourceFile(directory, 'requirements/scopes.yml')).toString('utf8'));
  check(validators.scopes, scopeData, 'scopes');
  const scopeIds = new Set();
  for (const scope of scopeData.scopes) {
    if (scopeIds.has(scope.id)) throw new Error(`duplicate scope: ${scope.id}`);
    scopeIds.add(scope.id);
  }
  let catalogs = options.catalogs;
  if (!catalogs) {
    const manifest = readJson(await sourceFile(directory, manifestPath));
    check(validators.baseline, manifest, 'baseline');
    const catalogPaths = (await declaredFiles(directory)).filter(file => file.startsWith('requirements/') && /\.ya?ml$/.test(file) && file !== 'requirements/scopes.yml');
    if (JSON.stringify(catalogPaths) !== JSON.stringify([...manifest.catalogPaths].sort())) throw new Error('catalog coverage must exactly match declared requirement files');
    if (!manifest.catalogPaths.includes('requirements/factory.yml')) throw new Error('factory catalog is required');
    catalogs = await Promise.all(manifest.catalogPaths.map(async file => readYaml((await sourceFile(directory, file)).toString('utf8'))));
  }
  const ids = new Set();
  const catalogIds = new Set();
  const approvedRequirementIds = [];
  for (const catalog of catalogs) {
    check(validators.catalog, catalog, 'catalog');
    if (catalogIds.has(catalog.catalogId)) throw new Error(`duplicate catalog: ${catalog.catalogId}`);
    catalogIds.add(catalog.catalogId);
    for (const record of catalog.requirements) {
      if (ids.has(record.id)) throw new Error(`duplicate requirement: ${record.id}`);
      ids.add(record.id);
      for (const scope of record.scopeIds) if (!scopeIds.has(scope)) throw new Error(`unknown scope: ${scope}`);
      if (record.status === 'approved') approvedRequirementIds.push(record.id);
    }
  }
  return { requirements: ids.size, approvedRequirementIds: approvedRequirementIds.sort(), scopes: scopeData.scopes.length };
}

export async function contentDigest(directory = root, revision = 'WORKTREE') {
  if (revision !== 'WORKTREE' && !immutable.test(revision)) throw new Error('Digest revision must be WORKTREE or immutable commit');
  const files = revision === 'WORKTREE' ? await declaredFiles(directory) : (await git(directory, ['ls-tree', '-r', '--name-only', revision])).toString('utf8').trim().split('\n').filter(file => roots.some(entry => file === entry || file.startsWith(`${entry}/`))).sort();
  if (!files.length) throw new Error('No authoritative requirements files');
  const digest = createHash('sha256');
  let total = 0;
  for (const file of files) {
    let data = revision === 'WORKTREE' ? await sourceFile(directory, file) : await git(directory, ['show', `${revision}:${file}`]);
    if (data.length > limit || (total += data.length) > 16 * limit) throw new Error('Baseline exceeds declared input limits');
    if (file === manifestPath) {
      const manifest = JSON.parse(data.toString('utf8'));
      manifest.sourceCommit = null;
      manifest.contentSha256 = null;
      data = Buffer.from(JSON.stringify(manifest));
    }
    digest.update(file).update('\0').update(data).update('\0');
  }
  return digest.digest('hex');
}

export async function validateBaseline(directory = root, { requireApproved = false, expectedRepositoryId } = {}) {
  const validators = await schemas(directory);
  const manifest = readJson(await sourceFile(directory, manifestPath));
  check(validators.baseline, manifest, 'baseline');
  if (requireApproved && manifest.status !== 'approved') throw new Error('Normative admission requires an approved baseline');
  if (expectedRepositoryId !== undefined && manifest.repositoryId !== expectedRepositoryId) throw new Error('Baseline repository identity mismatch');
  const catalogs = await validateCatalogs(directory);
  if (JSON.stringify(manifest.approvedRequirementIds) !== JSON.stringify(catalogs.approvedRequirementIds)) throw new Error('Approved IDs must exactly cover approved catalog records in sorted order');
  for (const revision of ['WORKTREE', manifest.sourceCommit]) {
    if (await contentDigest(directory, revision) !== manifest.contentSha256) throw new Error(`Requirements digest mismatch at ${revision}`);
  }
  return { status: manifest.status, sourceCommit: manifest.sourceCommit, contentSha256: manifest.contentSha256, ...catalogs };
}

/**
 * Derive reference-only applicability from an admitted immutable baseline.
 * directory locates trusted local Git objects; no checkout, fetch or write occurs.
 * pin: {repository, repositoryId, commit, version, contentSha256} is caller-admitted,
 * not selected by Issue/Project text. Hosting identity and adoption remain caller gates.
 * Returns {schemaVersion:1, authority:{...pin,sourceCommit}, repositories:[
 *   {repositoryId,scopeIds,requirements:[{id,catalogPath,scopeIds}]}]} in stable order.
 * Throws for invalid/unapproved inputs. The output does not authorize execution.
 */
export async function buildApplicabilityIndex(directory, pin) {
  if (pin?.repository !== 'agentic-delivery-lab/agentic-delivery-requirements'
    || pin.repositoryId !== 1416207421 || !immutable.test(pin.commit ?? '')
    || !/^[0-9a-f]{64}$/.test(pin.contentSha256 ?? '') || typeof pin.version !== 'string') {
    throw new Error('Applicability requires a complete immutable Requirements authority pin');
  }
  if ((await git(directory, ['cat-file', '-t', pin.commit])).toString('utf8').trim() !== 'commit') {
    throw new Error('Applicability baseline pin must identify a commit object');
  }
  const committedFile = async (file) => {
    const data = await git(directory, ['show', `${pin.commit}:${file}`]);
    if (data.length > limit) throw new Error(`Input exceeds 1 MiB: ${file}`);
    return data;
  };
  const validators = await schemas(root);
  const manifest = readJson(await committedFile(manifestPath));
  check(validators.baseline, manifest, 'baseline');
  if (manifest.status !== 'approved') throw new Error('Applicability requires an approved baseline');
  if (manifest.sourceRepository !== pin.repository || manifest.repositoryId !== pin.repositoryId
    || manifest.version !== pin.version || manifest.contentSha256 !== pin.contentSha256) {
    throw new Error('Applicability authority identity/version/digest pin mismatch');
  }
  if ((await git(directory, ['cat-file', '-t', manifest.sourceCommit])).toString('utf8').trim() !== 'commit') {
    throw new Error('Applicability prepared source must identify a commit object');
  }
  await git(directory, ['merge-base', '--is-ancestor', manifest.sourceCommit, pin.commit]);
  for (const revision of new Set([pin.commit, manifest.sourceCommit])) {
    if (await contentDigest(directory, revision) !== pin.contentSha256) throw new Error(`Applicability digest mismatch at ${revision}`);
  }
  const paths = (await git(directory, ['ls-tree', '-r', '--name-only', pin.commit])).toString('utf8').trim().split('\n');
  const catalogsInTree = paths.filter(file => file.startsWith('requirements/') && /\.ya?ml$/.test(file) && file !== 'requirements/scopes.yml').sort();
  if (JSON.stringify(catalogsInTree) !== JSON.stringify([...manifest.catalogPaths].sort())) throw new Error('Applicability catalog coverage mismatch');
  if (!manifest.catalogPaths.includes('requirements/factory.yml')) throw new Error('Applicability requires the factory catalog');
  const scopes = readYaml((await committedFile('requirements/scopes.yml')).toString('utf8'));
  const catalogs = await Promise.all(manifest.catalogPaths.map(async catalogPath => ({
    catalogPath, catalog: readYaml((await committedFile(catalogPath)).toString('utf8')),
  })));
  const validated = await validateCatalogs(root, { scopes, catalogs: catalogs.map(entry => entry.catalog) });
  if (scopes.scopes.some(scope => scope.repositoryIds.some(id => !Number.isSafeInteger(id) || id < 1))) {
    throw new Error('Applicability requires safe native repository IDs in scopes');
  }
  if (JSON.stringify(validated.approvedRequirementIds) !== JSON.stringify(manifest.approvedRequirementIds)) {
    throw new Error('Applicability approved IDs do not cover the baseline');
  }
  const repositoryIds = [...new Set(scopes.scopes.flatMap(scope => scope.repositoryIds))].sort((a, b) => a - b);
  const repositories = repositoryIds.map(repositoryId => {
    const scopeIds = scopes.scopes.filter(scope => scope.repositoryIds.includes(repositoryId)).map(scope => scope.id).sort();
    const requirements = catalogs.flatMap(({ catalogPath, catalog }) => catalog.requirements
      .filter(record => record.status === 'approved' && record.scopeIds.some(id => scopeIds.includes(id)))
      .map(record => ({ id: record.id, catalogPath, scopeIds: record.scopeIds.filter(id => scopeIds.includes(id)).sort() })))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return { repositoryId, scopeIds, requirements };
  });
  const authority = { repository: pin.repository, repositoryId: pin.repositoryId, commit: pin.commit,
    version: pin.version, contentSha256: pin.contentSha256, sourceCommit: manifest.sourceCommit };
  return { schemaVersion: 1, authority, repositories };
}

/** Select only an explicit consumer, revalidating the immutable source; never infer factory scope. */
export async function selectApplicableRequirements(directory, pin, repositoryId) {
  if (!Number.isSafeInteger(repositoryId) || repositoryId < 1) throw new Error('Applicability requires a positive native repository ID');
  const index = await buildApplicabilityIndex(directory, pin);
  const selected = index.repositories.find(entry => entry.repositoryId === repositoryId);
  if (!selected) throw new Error('Unknown repository applicability; consumer must hold');
  return { schemaVersion: index.schemaVersion, authority: index.authority, ...selected };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some(argument => argument !== '--approved')) throw new Error('Usage: node tools/validate-requirements.mjs [--approved]');
    console.log(JSON.stringify(await validateBaseline(root, { requireApproved: process.argv.includes('--approved') })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
