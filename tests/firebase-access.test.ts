import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseAccessArgs,
  updatedClaims,
} from '../scripts/firebase-access.ts';

const baseArgs = [
  '--project',
  'demo-project',
  '--confirm-project',
  'demo-project',
  '--uid',
  'uid-123',
  '--grant',
];

test('la operacion administrativa es vista previa salvo --apply', () => {
  const preview = parseAccessArgs(baseArgs);
  const apply = parseAccessArgs([...baseArgs, '--apply']);

  assert.equal(preview.apply, false);
  assert.equal(apply.apply, true);
  assert.equal(preview.action, 'grant');
});

test('exige confirmacion exacta del proyecto, selector unico y accion unica', () => {
  assert.throws(
    () => parseAccessArgs(baseArgs.with(3, 'otro-project')),
    /no coincide/,
  );
  assert.throws(
    () => parseAccessArgs([...baseArgs, '--email', 'persona@example.com']),
    /exactamente uno/,
  );
  assert.throws(
    () => parseAccessArgs([...baseArgs, '--revoke']),
    /exactamente una accion/,
  );
});

test('grant y revoke preservan los demas custom claims', () => {
  assert.deepEqual(updatedClaims({ role: 'operator' }, 'grant'), {
    role: 'operator',
    appAccess: true,
  });
  assert.deepEqual(updatedClaims({ role: 'operator', appAccess: true }, 'revoke'), {
    role: 'operator',
  });
  assert.deepEqual(updatedClaims({ role: 'operator', appAccess: false }, 'revoke'), {
    role: 'operator',
  });
});
