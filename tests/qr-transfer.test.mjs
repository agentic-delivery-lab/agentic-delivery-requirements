import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { importQualityScenarios, projectQualityScenarios } from '../tools/import-quality-scenarios.mjs';
import { readYaml } from '../tools/validate-requirements.mjs';

const source = await readFile(new URL('../migration/quality-scenarios-origin.yml', import.meta.url), 'utf8');
const provenance = JSON.parse(await readFile(new URL('../migration/qr-origin.json', import.meta.url), 'utf8'));

test('QR import preserves every original identity, scenario, status and evidence reference', () => {
  const records = importQualityScenarios(source, provenance);
  const original = readYaml(source);
  assert.equal(records.length, 18);
  assert.deepEqual(projectQualityScenarios(records), original);
  assert(records.every(record => record.status === 'proposed' && record.verification.evidenceStatus === 'unverified' && !record.approval));
  assert(records.every(record => record.source.sha256 === createHash('sha256').update(source).digest('hex')));
});

test('tampered origin, moving revision, duplicate IDs and incomplete scenarios fail import', () => {
  assert.throws(() => importQualityScenarios(source + '\n# modified', provenance), /digest/);
  assert.throws(() => importQualityScenarios(source, { ...provenance, sourceCommit: 'main' }), /immutable/);
  const parsed = readYaml(source);
  parsed.scenarios[1].id = parsed.scenarios[0].id;
  const duplicate = JSON.stringify(parsed);
  assert.throws(() => importQualityScenarios(duplicate, { ...provenance, sha256: createHash('sha256').update(duplicate).digest('hex') }), /duplicate/);
  delete parsed.scenarios[0].measure;
  const incomplete = JSON.stringify(parsed);
  assert.throws(() => importQualityScenarios(incomplete, { ...provenance, sha256: createHash('sha256').update(incomplete).digest('hex') }), /measure/);
});

test('inferred execution obligations are not injected into the historical QR projection', () => {
  const records = importQualityScenarios(source, provenance);
  records.push({ id: 'FR-001', status: 'proposed', statement: 'Candidate origin obligation' });
  assert.deepEqual(projectQualityScenarios(records), readYaml(source));
});
