import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateRecovery,
  parseArgs,
} from '../scripts/firebase-recovery-doctor.ts';

const enabledDatabase = {
  status: 'success',
  result: {
    name: 'projects/demo/databases/(default)',
    pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_ENABLED',
    deleteProtectionState: 'DELETE_PROTECTION_ENABLED',
    versionRetentionPeriod: '604800s',
  },
};

test('exige seleccionar el proyecto explicitamente', () => {
  assert.throws(() => parseArgs([]), /--project/);
  assert.deepEqual(parseArgs(['--project', 'demo-project']), {
    project: 'demo-project',
    database: '(default)',
    json: false,
    help: false,
  });
});

test('marca como saludable una base con todos los controles comprobados', () => {
  const evaluation = evaluateRecovery({
    database: enabledDatabase,
    schedules: { status: 'success', result: [{ name: 'weekly' }] },
    backups: {
      status: 'success',
      result: {
        southamerica: [{
          name: 'projects/demo/locations/southamerica/backups/backup-1',
          database: 'projects/demo/databases/(default)',
          state: 'READY',
        }],
      },
    },
    databaseId: '(default)',
  });

  assert.equal(evaluation.healthy, true);
  assert.equal(evaluation.checks.every((check) => check.ok), true);
});

test('detecta PITR, proteccion y backups ausentes sin alterar nada', () => {
  const evaluation = evaluateRecovery({
    database: {
      status: 'success',
      result: {
        name: 'projects/demo/databases/(default)',
        pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_DISABLED',
        deleteProtectionState: 'DELETE_PROTECTION_DISABLED',
        versionRetentionPeriod: '3600s',
      },
    },
    schedules: { status: 'success', result: [] },
    backups: { status: 'success', result: {} },
    databaseId: '(default)',
  });

  assert.equal(evaluation.healthy, false);
  assert.deepEqual(evaluation.checks.map((check) => check.ok), [false, false, false, false]);
});

test('no atribuye a la base un backup identificable de otra base', () => {
  const evaluation = evaluateRecovery({
    database: enabledDatabase,
    schedules: { status: 'success', result: [{ name: 'weekly' }] },
    backups: {
      status: 'success',
      result: [{ database: 'projects/demo/databases/otra-base', state: 'READY' }],
    },
    databaseId: '(default)',
  });

  assert.equal(evaluation.checks.find((check) => check.key === 'availableBackup')?.ok, false);
});

test('solo cuenta backups READY e identificados para la base', () => {
  const evaluation = evaluateRecovery({
    database: enabledDatabase,
    schedules: { status: 'success', result: [{ name: 'weekly' }] },
    backups: {
      status: 'success',
      result: [
        { database: 'projects/demo/databases/(default)', state: 'CREATING' },
        { database: 'projects/demo/databases/(default)', state: 'NEEDS_REPAIR' },
        { state: 'READY' },
      ],
    },
    databaseId: '(default)',
  });

  assert.equal(evaluation.checks.find((check) => check.key === 'availableBackup')?.ok, false);
});
