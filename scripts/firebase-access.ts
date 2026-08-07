import {
  applicationDefault,
  deleteApp,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getAuth, type Auth, type UserRecord } from 'firebase-admin/auth';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

type AccessAction = 'grant' | 'revoke';

interface AccessOptions {
  project: string | null;
  confirmProject: string | null;
  uid: string | null;
  email: string | null;
  action: AccessAction | null;
  apply: boolean;
  help: boolean;
}

const HELP = `Uso (vista previa por defecto):
  npm run firebase:access -- --project <project-id> --confirm-project <project-id> \\
    (--uid <uid> | --email <email>) (--grant | --revoke) [--apply]

Opciones obligatorias:
  --project <id>          Proyecto Firebase de destino
  --confirm-project <id>  Debe coincidir exactamente con --project
  --uid <uid>             UID exacto del usuario (excluyente con --email)
  --email <email>         Email exacto del usuario (excluyente con --uid)
  --grant                 Otorga el custom claim appAccess=true
  --revoke                Elimina el custom claim appAccess

Seguridad:
  Sin --apply solo muestra la operacion y no escribe.
  --apply modifica Auth y revoca refresh tokens para exigir un nuevo inicio de sesion.`;

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Falta el valor de ${flag}.`);
  return value.trim();
}

function setExclusiveAction(options: AccessOptions, action: AccessAction): void {
  if (options.action && options.action !== action) {
    throw new Error('Debes elegir exactamente una accion: --grant o --revoke.');
  }
  options.action = action;
}

export function parseAccessArgs(args: string[]): AccessOptions {
  const options: AccessOptions = {
    project: null,
    confirmProject: null,
    uid: null,
    email: null,
    action: null,
    apply: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--project') {
      options.project = requireValue(args, index, argument);
      index += 1;
    } else if (argument === '--confirm-project') {
      options.confirmProject = requireValue(args, index, argument);
      index += 1;
    } else if (argument === '--uid') {
      options.uid = requireValue(args, index, argument);
      index += 1;
    } else if (argument === '--email') {
      options.email = requireValue(args, index, argument).toLocaleLowerCase('en-US');
      index += 1;
    } else if (argument === '--grant') {
      setExclusiveAction(options, 'grant');
    } else if (argument === '--revoke') {
      setExclusiveAction(options, 'revoke');
    } else if (argument === '--apply') {
      options.apply = true;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error(`Opcion desconocida: ${argument ?? ''}`);
    }
  }

  if (options.help) return options;
  if (!options.project || !options.confirmProject) {
    throw new Error('Debes indicar --project y --confirm-project explicitamente.');
  }
  if (options.project !== options.confirmProject) {
    throw new Error('--confirm-project no coincide exactamente con --project.');
  }
  if (Boolean(options.uid) === Boolean(options.email)) {
    throw new Error('Debes indicar exactamente uno de --uid o --email.');
  }
  if (!options.action) throw new Error('Debes elegir exactamente una accion: --grant o --revoke.');
  if (options.uid && (options.uid.length > 128 || /\s/.test(options.uid))) {
    throw new Error('El UID debe tener entre 1 y 128 caracteres y no contener espacios.');
  }
  if (options.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(options.email)) {
    throw new Error('El email no tiene un formato valido.');
  }

  return options;
}

export function updatedClaims(
  currentClaims: Record<string, unknown> | undefined,
  action: AccessAction,
): Record<string, unknown> {
  const claims = { ...(currentClaims ?? {}) };
  if (action === 'grant') claims.appAccess = true;
  else delete claims.appAccess;
  return claims;
}

async function loadAdmin(project: string): Promise<{
  auth: Auth;
  close: () => Promise<void>;
}> {
  const app: App = initializeApp({
    credential: applicationDefault(),
    projectId: project,
  });

  return {
    auth: getAuth(app),
    close: () => deleteApp(app),
  };
}

function describeTarget(options: AccessOptions, user: UserRecord): string {
  if (options.email) return `email ${options.email} (UID ${user.uid})`;
  return `UID ${user.uid}${user.email ? ` (${user.email})` : ''}`;
}

async function main(): Promise<void> {
  let options: AccessOptions;
  try {
    options = parseAccessArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(HELP);
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    console.log(HELP);
    return;
  }
  if (!options.project || !options.action) return;

  let close: (() => Promise<void>) | undefined;
  try {
    const admin = await loadAdmin(options.project);
    close = admin.close;
    const user = options.uid
      ? await admin.auth.getUser(options.uid)
      : await admin.auth.getUserByEmail(options.email ?? '');

    if (options.action === 'grant' && (!user.email || !user.emailVerified)) {
      throw new Error('Se rechazo el grant: el usuario debe tener un email verificado.');
    }

    const target = describeTarget(options, user);
    const alreadyGranted = user.customClaims?.appAccess === true;
    const hasAppAccessClaim = Object.hasOwn(user.customClaims ?? {}, 'appAccess');
    const changesState = options.action === 'grant' ? !alreadyGranted : hasAppAccessClaim;

    console.log(`Proyecto confirmado: ${options.project}`);
    console.log(`Usuario resuelto: ${target}`);
    console.log(`Accion: ${options.action === 'grant' ? 'otorgar' : 'revocar'} appAccess`);

    if (!options.apply) {
      console.log(changesState
        ? 'VISTA PREVIA: no se realizo ningun cambio. Repite con --apply para confirmar.'
        : 'VISTA PREVIA: el usuario ya tiene el estado solicitado; no hay cambios.');
      return;
    }

    if (changesState) {
      await admin.auth.setCustomUserClaims(
        user.uid,
        updatedClaims(user.customClaims, options.action),
      );
    }
    // This remains intentionally idempotent. If a previous run changed the
    // claim but failed while revoking sessions, an --apply retry reaches this
    // call again instead of returning early.
    await admin.auth.revokeRefreshTokens(user.uid);
    console.log(changesState
      ? 'Cambio aplicado y sesiones anteriores revocadas. El usuario debe iniciar sesion nuevamente.'
      : 'El claim ya tenia el estado solicitado; las sesiones anteriores se revocaron nuevamente.');
  } catch (error) {
    console.error(`No se pudo actualizar appAccess: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    if (close) await close();
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  void main();
}
