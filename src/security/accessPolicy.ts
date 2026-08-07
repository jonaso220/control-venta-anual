export interface AccessPolicyInput {
  allowedEmails?: string;
  allowedUids?: string;
  requireAllowlist?: boolean;
}

export interface AccessPolicy {
  allowedEmails: ReadonlySet<string>;
  allowedUids: ReadonlySet<string>;
  enforced: boolean;
}

export interface AuthenticatedIdentity {
  uid: string;
  email: string | null;
}

export const USER_NOT_ALLOWED_MESSAGE =
  'Esta cuenta de Google no esta autorizada para usar la aplicacion.';

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createAccessPolicy(input: AccessPolicyInput): AccessPolicy {
  const emails = splitList(input.allowedEmails).map((email) => email.toLocaleLowerCase('en-US'));
  const uids = splitList(input.allowedUids);

  return {
    allowedEmails: new Set(emails),
    allowedUids: new Set(uids),
    enforced: Boolean(input.requireAllowlist || emails.length > 0 || uids.length > 0),
  };
}

export function isIdentityAllowed(policy: AccessPolicy, identity: AuthenticatedIdentity): boolean {
  if (!policy.enforced) return true;

  const email = identity.email?.trim().toLocaleLowerCase('en-US');
  return policy.allowedUids.has(identity.uid) || Boolean(email && policy.allowedEmails.has(email));
}

export function hasRequiredAppAccessClaim(
  required: boolean,
  claims: Readonly<Record<string, unknown>>,
): boolean {
  return !required || claims.appAccess === true;
}

export class AccessDeniedError extends Error {
  readonly code = 'auth/user-not-allowed';

  constructor() {
    super(USER_NOT_ALLOWED_MESSAGE);
    this.name = 'AccessDeniedError';
  }
}
