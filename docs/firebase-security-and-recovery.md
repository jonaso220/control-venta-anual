# Seguridad y recuperacion de Firebase

Esta guia separa los cambios seguros de cliente de las activaciones remotas que pueden requerir facturacion. Ningun comando de activacion debe ejecutarse sin verificar primero el proyecto, el costo y la aprobacion del responsable.

## Doctor de recuperacion (solo lectura)

El doctor consulta la base, las programaciones y los backups mediante Firebase CLI. Exige un proyecto explicito, no tiene comandos de escritura y devuelve:

- codigo `0` si PITR, proteccion contra borrado, una programacion y un backup disponible estan comprobados;
- codigo `2` si falta algun control;
- codigo `1` si no pudo verificar el estado.

```bash
npx tsx scripts/firebase-recovery-doctor.ts --project <project-id>
npx tsx scripts/firebase-recovery-doctor.ts --project <project-id> --json
```

El respaldo JSON de la aplicacion sigue siendo util, pero no reemplaza un backup administrado: debe descargarse, comprobar sus conteos y ensayar su restauracion en una cuenta o entorno no productivo.

La restauracion JSON es aditiva, no un rollback destructivo. Conserva documentos y versiones que no aparecen en el archivo, no reescribe snapshots historicos incompatibles y prioriza un historial de gastos fijos ya existente cuando es mas nuevo que el respaldo. Antes de escribir, la interfaz genera un respaldo de seguridad y espera una segunda confirmacion para que el usuario pueda comprobar la descarga. Si una operacion de varios lotes se interrumpe, informa cuantos documentos se aplicaron; el mismo archivo puede reintentarse sin borrar datos.

## Controles remotos y costos

Los siguientes ejemplos se documentan para una ventana operativa controlada. **No se ejecutan desde la aplicacion ni desde el doctor.** PITR y backups administrados son funciones facturables y requieren una cuenta de facturacion; consulta precios antes de activarlos. La proteccion contra borrado puede activarse por separado sin habilitar esos servicios pagos.

```bash
# Proteccion contra borrado
npx firebase-tools firestore:databases:update '(default)' \
  --project <project-id> \
  --delete-protection ENABLED

# PITR (facturable)
npx firebase-tools firestore:databases:update '(default)' \
  --project <project-id> \
  --point-in-time-recovery ENABLED

# Backup semanal administrado (requiere Blaze y genera almacenamiento facturable)
npx firebase-tools firestore:backups:schedules:create \
  --project <project-id> \
  --database '(default)' \
  --recurrence WEEKLY \
  --day-of-week SUNDAY \
  --retention 30d
```

Despues de una activacion aprobada, vuelve a ejecutar el doctor. Una programacion nueva no cuenta como recuperacion comprobada hasta que exista al menos un backup disponible. La restauracion de un backup crea una base nueva y tambien debe ensayarse y documentarse.

Fuentes oficiales: [PITR de Firestore](https://firebase.google.com/docs/firestore/use-pitr), [backups programados](https://firebase.google.com/docs/firestore/backups), [proteccion contra borrado](https://firebase.google.com/docs/firestore/manage-databases) y [precios de Firestore](https://firebase.google.com/docs/firestore/pricing).

## App Check web

La integracion usa reCAPTCHA Enterprise y solo se inicializa cuando existe:

```dotenv
VITE_FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY=clave-publica-del-sitio
```

La ausencia de esa variable conserva el comportamiento actual. Orden recomendado:

1. Crea una clave de sitio web de reCAPTCHA Enterprise y registra la app en App Check.
2. Configura la variable en el hosting y publica el cliente.
3. Observa las metricas de App Check hasta confirmar que el trafico legitimo aparece como verificado.
4. Recién entonces evalua activar enforcement para Firestore. Activarlo antes puede bloquear clientes validos.

No se registro ni activo ninguna clave desde este repositorio. reCAPTCHA Enterprise ofrece una cuota sin cargo, pero puede facturar evaluaciones por encima de ella; revisa el precio y el trafico esperado antes de configurar la variable en produccion.

Para desarrollo local, crea `.env.local` con `VITE_FIREBASE_APPCHECK_DEBUG=true`. El SDK imprimira un token de depuracion que debe registrarse manualmente en Firebase Console. Nunca publiques esa variable, nunca guardes el token en Git y no agregues `localhost` a los dominios permitidos de reCAPTCHA.

Fuentes oficiales: [App Check con reCAPTCHA Enterprise](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider), [metricas antes de enforcement](https://firebase.google.com/docs/app-check/monitor-metrics) y [proveedor de depuracion](https://firebase.google.com/docs/app-check/web/debug-provider).

## Allowlist de acceso

Las variables aceptan valores separados por comas, punto y coma o espacios:

```dotenv
VITE_AUTH_ALLOWED_EMAILS=persona@example.com,otra@example.com
VITE_AUTH_ALLOWED_UIDS=uid-firebase-1,uid-firebase-2
VITE_AUTH_REQUIRE_ALLOWLIST=true
VITE_AUTH_REQUIRE_APP_ACCESS_CLAIM=true
```

- Sin emails, UIDs y con `REQUIRE=false`, se conserva el acceso actual.
- Si hay al menos un email o UID, la app cierra la sesion de cualquier cuenta que no coincida.
- Con `REQUIRE=true` y listas vacias, el cliente falla cerrado y no deja entrar a nadie.
- `VITE_AUTH_REQUIRE_APP_ACCESS_CLAIM=true` tambien comprueba en la interfaz el claim firmado por Firebase; debe activarse despues de provisionar los usuarios permitidos.

Estas variables `VITE_*` quedan visibles en el JavaScript publicado. La allowlist del navegador es una barrera de interfaz, no autorizacion de servidor, y App Check tampoco reemplaza la autorizacion. Por eso las reglas incluidas en el repositorio exigen además el custom claim firmado `appAccess == true` para cualquier dato de usuario.

### Provisionar `appAccess` sin bloquear produccion

Las reglas estrictas **no deben desplegarse** hasta otorgar el claim a todas las cuentas validas. El script administrativo usa Firebase Admin con Application Default Credentials, conserva otros custom claims y es vista previa salvo que se agregue `--apply`. Requiere repetir el proyecto como confirmacion para reducir el riesgo de operar sobre el destino equivocado.

```bash
# Configura credenciales administrativas fuera del repositorio y de Git.
export GOOGLE_APPLICATION_CREDENTIALS="/ruta/segura/service-account.json"

# Vista previa: lee el usuario, no escribe.
npm run firebase:access -- \
  --project <project-id> \
  --confirm-project <project-id> \
  --email persona@example.com \
  --grant

# Solo despues de revisar proyecto y usuario, aplica el grant.
npm run firebase:access -- \
  --project <project-id> \
  --confirm-project <project-id> \
  --email persona@example.com \
  --grant \
  --apply
```

Orden obligatorio de activacion:

1. Ejecuta primero la vista previa y luego el `--grant --apply` para cada usuario permitido.
2. Pide a esos usuarios cerrar sesion e iniciar sesion nuevamente; los claims aparecen en un ID token nuevo.
3. Configura `VITE_AUTH_REQUIRE_APP_ACCESS_CLAIM=true`, publica el cliente y confirma el acceso de una cuenta permitida.
4. Ejecuta las pruebas de reglas y, recien entonces, despliega `firestore.rules`.
5. Verifica acceso permitido y denegado sin eliminar los claims de la unica cuenta administrativa durante la prueba.

Para revocar, usa los mismos argumentos con `--revoke --apply`. El script elimina solo `appAccess` y revoca refresh tokens; un ID token ya emitido puede seguir siendo valido hasta expirar, por lo que una revocacion urgente requiere además evaluar deshabilitar la cuenta desde Firebase Authentication.

El script nunca imprime ID tokens ni credenciales. No guardes archivos de cuenta de servicio en el repositorio. La API de Admin sobrescribe el mapa de custom claims, por eso el script lee y preserva los claims ajenos a `appAccess` antes de escribir.

Como alternativa avanzada al archivo de cuenta de servicio, Firebase documenta credenciales ADC de usuario con un OAuth Client ID propio de tipo Desktop; un `gcloud auth application-default login` comun no es suficiente para Firebase Authentication.

Fuente oficial: [custom claims y Security Rules](https://firebase.google.com/docs/auth/admin/custom-claims) y [configuracion local de Firebase Admin](https://firebase.google.com/docs/admin/setup).
