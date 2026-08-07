# Control de ventas anual

Aplicación React para registrar unidades vendidas, márgenes, gastos fijos y variables, metas y resultados mensuales por cuenta de Google y por año.

## Desarrollo local

Requisitos: Node.js 24 LTS, npm y un proyecto Firebase con Google Sign-In y Cloud Firestore habilitados.

```bash
cp .env.example .env
npm ci
npm run dev
```

Completa `.env` con la configuración web pública de tu proyecto Firebase. El archivo `.env` está ignorado por Git.

App Check y la lista opcional de cuentas autorizadas se configuran también por variables de entorno. Si sus variables están vacías, el cliente conserva el comportamiento actual. Las reglas del repositorio sí exigen el custom claim administrativo `appAccess == true`: antes de desplegarlas hay que otorgarlo a las cuentas válidas. La guía de despliegue seguro, el script en vista previa, el modo de depuración y sus límites están en [`docs/firebase-security-and-recovery.md`](docs/firebase-security-and-recovery.md).

## Validación

```bash
npm run check
```

Las pruebas de reglas usan el emulador de Firestore y requieren Java 11 o superior:

```bash
npm run test:rules
```

`npm run check` ejecuta lint, pruebas unitarias y de interfaz, build de producción y el presupuesto de tamaño de los bundles. Las pruebas de reglas se mantienen separadas porque arrancan el emulador y requieren Java.

## Modelo financiero

- **Margen bruto:** unidades vendidas multiplicadas por el margen unitario aplicado a cada venta.
- **Gastos:** gastos fijos activos del mes más gastos variables de ese mes.
- **Resultado neto:** margen bruto menos gastos.
- **Acumulado:** solo meses transcurridos del año seleccionado.
- **Proyección anual:** anualiza margen, unidades y gastos variables observados; los gastos fijos se proyectan a 12 meses.

Cada venta nueva guarda un `marginSnapshot`. Por eso un cambio posterior de márgenes no reescribe el resultado histórico. Los registros legacy sin snapshot no contienen información suficiente para reconstruir el valor original: al guardar por primera vez los márgenes de ese año, se congelan usando la configuración elegida en ese momento.

La aplicación no incluye márgenes ni gastos privados por defecto. Cada cuenta debe crear su propia configuración en Firestore antes de registrar ventas nuevas.

## Respaldo y restauración

En **Configuración** hay dos salidas distintas:

- El Excel es un informe del año seleccionado y no es restaurable.
- El JSON es un respaldo completo y fresco, leído directamente del servidor. Incluye todos los años, IDs y timestamps de las siete colecciones conocidas, incluido el historial de gastos fijos, pero no incluye UID ni email.

Antes de restaurar, el archivo completo se valida. La restauración es aditiva: combina documentos por ID, conserva versiones históricas ya existentes y nunca borra documentos ausentes del archivo. Un historial inmutable con contenido incompatible se detecta antes de escribir. La confirmación tiene dos pasos: primero genera un respaldo de seguridad y pausa; solo después de que el usuario confirme que apareció en Descargas habilita la escritura. Los lotes son idempotentes y, si se interrumpen, la interfaz informa cuántos documentos se aplicaron para poder reintentar el mismo archivo.

Para comprobar, sin modificar Firebase, si existen PITR, protección contra borrado y backups administrados:

```bash
npx tsx scripts/firebase-recovery-doctor.ts --project <project-id>
```

El doctor falla si falta algún control y no activa funciones facturables. Los pasos externos deliberadamente pendientes se documentan en [`docs/firebase-security-and-recovery.md`](docs/firebase-security-and-recovery.md).

## Reglas e índices de Firestore

`firestore.rules` aplica aislamiento por UID y claim firmado, esquemas y rangos estrictos, timestamps de servidor, snapshots históricos inmutables y denegación por defecto. Las consultas que filtran por año se ordenan en el cliente, por lo que la carga ya no depende de que un índice compuesto termine de construirse.

Orden seguro para producción:

1. Descarga un respaldo completo y verifica su cantidad de documentos.
2. Otorga `appAccess` a todas las cuentas válidas y confirma un nuevo inicio de sesión siguiendo [`docs/firebase-security-and-recovery.md`](docs/firebase-security-and-recovery.md). Sin ese claim, las reglas nuevas bloquean toda lectura y escritura aunque el UID sea el propietario.
3. Configura las variables de acceso del hosting y publica esta versión de la aplicación. El cliente incluye una compatibilidad de lectura para las reglas anteriores; durante esta ventana coordinada no edites gastos fijos.
4. Confirma que la cuenta autorizada entra y ejecuta `npm run test:rules` contra el emulador.
5. Despliega inmediatamente las reglas nuevas y recarga la aplicación. Desde ese momento, la escritura del resumen y su versión mensual es atómica:

```bash
npx firebase-tools use <project-id>
npx firebase-tools deploy --only firestore:rules
```

No actives las reglas nuevas antes de publicar el cliente actualizado: una versión antigua no envía `marginSnapshot` y sus escrituras de ventas serán rechazadas.
