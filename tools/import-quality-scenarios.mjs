import { createHash } from 'node:crypto';
import { readYaml } from './validate-requirements.mjs';

const fields = ['id', 'name', 'stakeholder', 'concern', 'stimulus', 'response', 'measure', 'evidence', 'status'];

export function importQualityScenarios(source, provenance) {
  if (provenance.repository !== 'agentic-delivery-lab/agentic-delivery-architecture'
    || !/^[0-9a-f]{40}$/.test(provenance.sourceCommit ?? '')
    || provenance.path !== 'architecture/quality/quality-scenarios.yml') throw new Error('QR import requires the immutable Architecture origin');
  if (createHash('sha256').update(source).digest('hex') !== provenance.sha256) throw new Error('QR origin digest mismatch');
  const origin = readYaml(source);
  if (origin.schemaVersion !== 2 || !Array.isArray(origin.scenarios)) throw new Error('Unsupported QR origin contract');
  const ids = new Set();
  return origin.scenarios.map(scenario => {
    for (const key of fields) {
      if (key === 'evidence') {
        if (!Array.isArray(scenario.evidence) || !scenario.evidence.every(value => typeof value === 'string')) throw new Error('QR evidence must retain original references');
      } else if (typeof scenario[key] !== 'string' || !scenario[key].trim()) throw new Error(`QR origin requires ${key}`);
    }
    if (!/^QR-[0-9]{3}$/.test(scenario.id) || ids.has(scenario.id)) throw new Error('Invalid or duplicate QR identity');
    ids.add(scenario.id);
    if (Object.keys(scenario).some(key => !fields.includes(key))) throw new Error('Unknown QR origin property');
    return {
      id: scenario.id, owner: 'sjefsharp', scopeIds: ['factory'], status: 'proposed',
      statement: scenario.response, source: { ...provenance },
      verification: { criterion: scenario.measure, evidenceStatus: 'unverified', evidence: [] },
      qualityScenario: {
        name: scenario.name, stakeholder: scenario.stakeholder, concern: scenario.concern,
        stimulus: scenario.stimulus, response: scenario.response, measure: scenario.measure,
        historicalStatus: scenario.status, historicalEvidence: [...scenario.evidence],
      },
    };
  });
}

export function projectQualityScenarios(records) {
  const scenarios = records.filter(record => record.id.startsWith('QR-')).map(record => {
    const original = record.qualityScenario;
    if (!original) throw new Error(`Missing quality scenario for ${record.id}`);
    return {
      id: record.id, name: original.name, stakeholder: original.stakeholder,
      concern: original.concern, stimulus: original.stimulus, response: original.response,
      measure: original.measure, evidence: [...original.historicalEvidence], status: original.historicalStatus,
    };
  });
  return { schemaVersion: 2, scenarios };
}
