import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAccessPolicy,
  hasRequiredAppAccessClaim,
  isIdentityAllowed,
} from '../src/security/accessPolicy.ts';

const identity = { uid: 'uid-123', email: 'persona@example.com' };

test('mantiene el acceso actual cuando no se configura una allowlist', () => {
  const policy = createAccessPolicy({});

  assert.equal(policy.enforced, false);
  assert.equal(isIdentityAllowed(policy, identity), true);
});

test('autoriza por email sin distinguir mayusculas', () => {
  const policy = createAccessPolicy({
    allowedEmails: 'OTRA@example.com; PERSONA@EXAMPLE.COM',
  });

  assert.equal(isIdentityAllowed(policy, identity), true);
});

test('autoriza por UID aunque el email no coincida', () => {
  const policy = createAccessPolicy({ allowedUids: 'otro-uid, uid-123' });

  assert.equal(isIdentityAllowed(policy, identity), true);
});

test('rechaza una identidad ausente de una allowlist configurada', () => {
  const policy = createAccessPolicy({ allowedEmails: 'otra@example.com' });

  assert.equal(isIdentityAllowed(policy, identity), false);
});

test('require allowlist falla cerrado cuando las listas estan vacias', () => {
  const policy = createAccessPolicy({ requireAllowlist: true });

  assert.equal(policy.enforced, true);
  assert.equal(isIdentityAllowed(policy, identity), false);
});

test('el claim de servidor falla cerrado solo cuando se configura como obligatorio', () => {
  assert.equal(hasRequiredAppAccessClaim(false, {}), true);
  assert.equal(hasRequiredAppAccessClaim(true, {}), false);
  assert.equal(hasRequiredAppAccessClaim(true, { appAccess: false }), false);
  assert.equal(hasRequiredAppAccessClaim(true, { appAccess: true }), true);
});
