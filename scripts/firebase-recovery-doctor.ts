import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

interface DoctorOptions {
  project: string | null;
  database: string;
  json: boolean;
  help: boolean;
}

interface RecoveryInput {
  database: unknown;
  schedules: unknown;
  backups: unknown;
  databaseId: string;
}

export interface RecoveryCheck {
  key: 'pitr' | 'deleteProtection' | 'backupSchedule' | 'availableBackup';
  label: string;
  ok: boolean;
  detail: string;
}

export interface RecoveryEvaluation {
  healthy: boolean;
  checks: RecoveryCheck[];
}

const HELP = `Uso:
  npx tsx scripts/firebase-recovery-doctor.ts --project <project-id> [opciones]

Opciones:
  --database <database-id>  Base a inspeccionar (por defecto: (default))
  --json                    Imprime un resultado estructurado
  --help                    Muestra esta ayuda

Este comando es de SOLO LECTURA. No activa PITR, backups ni proteccion de borrado.`;

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Falta el valor de ${flag}.`);
  return value;
}

export function parseArgs(args: string[]): DoctorOptions {
  const options: DoctorOptions = {
    project: null,
    database: '(default)',
    json: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--project') {
      options.project = requireValue(args, index, argument);
      index += 1;
    } else if (argument?.startsWith('--project=')) {
      options.project = argument.slice('--project='.length);
    } else if (argument === '--database') {
      options.database = requireValue(args, index, argument);
      index += 1;
    } else if (argument?.startsWith('--database=')) {
      options.database = argument.slice('--database='.length);
    } else if (argument === '--json') {
      options.json = true;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error(`Opcion desconocida: ${argument ?? ''}`);
    }
  }

  if (!options.help && !options.project) {
    throw new Error('Debes indicar --project explicitamente.');
  }
  if (options.project === '') throw new Error('El project-id no puede estar vacio.');
  if (!options.database) throw new Error('El database-id no puede estar vacio.');

  return options;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapFirebaseResult(value: unknown): unknown {
  if (isRecord(value) && Object.hasOwn(value, 'result')) return value.result;
  return value;
}

function recordsFromResult(value: unknown, collectionKey: string): unknown[] {
  const result = unwrapFirebaseResult(value);
  if (Array.isArray(result)) return result;
  if (!isRecord(result)) return [];

  const directCollection = result[collectionKey];
  if (Array.isArray(directCollection)) return directCollection;

  return Object.values(result).flatMap((entry) => Array.isArray(entry) ? entry : []);
}

function countBackupsForDatabase(value: unknown, databaseName: string, databaseId: string): number {
  const backups = recordsFromResult(value, 'backups');
  const databaseSuffix = `/databases/${databaseId}`;
  return backups.filter((backup) => {
    if (!isRecord(backup) || backup.state !== 'READY') return false;
    const sourceDatabase = [backup.database, backup.databaseName, backup.sourceDatabase]
      .find((candidate): candidate is string => typeof candidate === 'string');
    if (!sourceDatabase) return false;
    return sourceDatabase === databaseName || sourceDatabase.endsWith(databaseSuffix);
  }).length;
}

export function evaluateRecovery(input: RecoveryInput): RecoveryEvaluation {
  const databaseResult = unwrapFirebaseResult(input.database);
  const database = isRecord(databaseResult) ? databaseResult : {};
  const databaseName = typeof database.name === 'string'
    ? database.name
    : `/databases/${input.databaseId}`;
  const pitrState = typeof database.pointInTimeRecoveryEnablement === 'string'
    ? database.pointInTimeRecoveryEnablement
    : 'DESCONOCIDO';
  const deleteProtectionState = typeof database.deleteProtectionState === 'string'
    ? database.deleteProtectionState
    : 'DESCONOCIDO';
  const versionRetention = typeof database.versionRetentionPeriod === 'string'
    ? database.versionRetentionPeriod
    : 'desconocida';
  const scheduleCount = recordsFromResult(input.schedules, 'backupSchedules').length;
  const backupCount = countBackupsForDatabase(input.backups, databaseName, input.databaseId);

  const checks: RecoveryCheck[] = [
    {
      key: 'pitr',
      label: 'Recuperacion a un punto en el tiempo (PITR)',
      ok: pitrState === 'POINT_IN_TIME_RECOVERY_ENABLED',
      detail: `${pitrState}; retencion de versiones: ${versionRetention}`,
    },
    {
      key: 'deleteProtection',
      label: 'Proteccion contra borrado de la base',
      ok: deleteProtectionState === 'DELETE_PROTECTION_ENABLED',
      detail: deleteProtectionState,
    },
    {
      key: 'backupSchedule',
      label: 'Programacion de backups administrados',
      ok: scheduleCount > 0,
      detail: `${scheduleCount} programacion(es) encontrada(s)`,
    },
    {
      key: 'availableBackup',
      label: 'Backup administrado disponible',
      ok: backupCount > 0,
      detail: `${backupCount} backup(s) encontrado(s) para la base`,
    },
  ];

  return { healthy: checks.every((check) => check.ok), checks };
}

function resolveFirebaseCli(cwd: string): string {
  const executable = process.platform === 'win32' ? 'firebase.cmd' : 'firebase';
  const firebaseCli = join(cwd, 'node_modules', '.bin', executable);
  if (!existsSync(firebaseCli)) {
    throw new Error('No se encontro Firebase CLI local. Ejecuta npm ci antes del doctor.');
  }
  return firebaseCli;
}

function runFirebaseJson(firebaseCli: string, args: string[]): unknown {
  const result = spawnSync(firebaseCli, [...args, '--non-interactive', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || 'Firebase CLI termino con error').trim();
    throw new Error(detail.slice(-2000));
  }

  try {
    return JSON.parse(result.stdout) as unknown;
  } catch {
    throw new Error('Firebase CLI no devolvio JSON valido.');
  }
}

function printHumanResult(project: string, database: string, evaluation: RecoveryEvaluation): void {
  console.log('Firebase Recovery Doctor - SOLO LECTURA');
  console.log(`Proyecto: ${project}`);
  console.log(`Base: ${database}`);
  console.log('');
  for (const check of evaluation.checks) {
    console.log(`[${check.ok ? 'OK' : 'PENDIENTE'}] ${check.label}: ${check.detail}`);
  }
  console.log('');
  console.log(evaluation.healthy
    ? 'Resultado: controles de recuperacion verificados.'
    : 'Resultado: faltan controles. El doctor no realizo ningun cambio.');
}

async function main(): Promise<void> {
  let options: DoctorOptions;
  try {
    options = parseArgs(process.argv.slice(2));
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

  const project = options.project;
  if (!project) return;

  try {
    const firebaseCli = resolveFirebaseCli(process.cwd());
    const commonArgs = ['--project', project];
    const database = runFirebaseJson(firebaseCli, [
      'firestore:databases:get',
      options.database,
      ...commonArgs,
    ]);
    const schedules = runFirebaseJson(firebaseCli, [
      'firestore:backups:schedules:list',
      '--database',
      options.database,
      ...commonArgs,
    ]);
    const backups = runFirebaseJson(firebaseCli, [
      'firestore:backups:list',
      ...commonArgs,
    ]);
    const evaluation = evaluateRecovery({ database, schedules, backups, databaseId: options.database });

    if (options.json) {
      console.log(JSON.stringify({ project, database: options.database, ...evaluation }, null, 2));
    } else {
      printHumanResult(project, options.database, evaluation);
    }
    process.exitCode = evaluation.healthy ? 0 : 2;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      console.error(JSON.stringify({ project, database: options.database, error: message }));
    } else {
      console.error(`No se pudo completar el doctor: ${message}`);
    }
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  void main();
}
