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

## Precios por fecha y desglose de ventas

La app conserva el registro mensual `sales/AAAA-MM`. No tiene ventas diarias y no
inventa una distribución diaria. En **Precios** se añaden vigencias con fecha
`AAAA-MM-DD`, precio al público y margen propio para los cuatro productos.
El importe de la empresa por unidad es público menos margen. No se registra ni se
presupone ningún pago efectuado.

En **Ventas → Ventas por vigencia**, selecciona el mes e introduce las unidades
reales de cada tramo. Por ejemplo, un aumento el 12 de octubre genera los tramos
1–11 y 12–31. Configura primero las tarifas necesarias para cubrir todo el mes;
se pueden añadir fechas anteriores faltantes. No hay precios privados por defecto.
Los importes admiten dos decimales, margen cero y precio cero explícitos.

Para convertir un mes existente, el reparto debe conservar exactamente las
unidades de cada producto y se confirma el cálculo en pantalla. Después de guardar
pueden corregirse las cantidades de cada tramo. El `marginSnapshot` mensual
original permanece inmutable; el nuevo campo `allocations` guarda las fechas,
cantidades y snapshots de precio/margen que explican el cálculo confirmado.
Añadir otra vigencia nunca recalcula automáticamente ventas guardadas. La acción
**Revisar reparto con nuevas vigencias** permite una nueva división explícita,
conservando de nuevo los totales durante ese paso. No es un diario de auditoría de
cada edición de cantidades o reparto.

Los meses antiguos sin desglose conservan la ganancia calculada con su margen
histórico. Sus importes de público y empresa aparecen pendientes, y los resúmenes
se identifican como parciales. Dashboard, ventas, metas y Excel utilizan el mismo
cálculo de ganancia. El Excel agrega detalle por vigencia y aclara que el importe
de empresa no representa pagos.

Las vigencias se configuran por año: antes de registrar un año nuevo hay que
configurar su tarifa inicial; no se arrastran importes automáticamente. Las
vigencias guardadas son inmutables, con un máximo de 24 por año y dos tramos (un cambio dentro del mes)
por mes. El límite mantiene las validaciones dentro del presupuesto de reglas de
Firestore. Se requiere coordinación del cliente y `firestore.rules` para activar
la función; esta mejora local no publica ni migra datos de producción.

El respaldo JSON v4 conserva vigencias, desgloses y precios anteriores desconocidos y admite los respaldos v1/v2/v3.
La restauración valida referencias y conflictos antes de escribir, conserva
vigencias existentes y agrega las faltantes individualmente. Si se interrumpe,
puede reintentarse; un archivo viejo no elimina tarifas ni sustituye un desglose
histórico ya guardado. Los respaldos v4 no deben abrirse en clientes anteriores.


### Revisión local de períodos y valores anteriores

La pantalla de precios presenta tarjetas equivalentes por período, destaca la vigencia de hoy y separa el formulario de cambio. Los valores anuales anteriores se muestran como márgenes conservados; el registro de ajustes distingue fecha de guardado de fecha de vigencia. Seleccionar una fecha de cambio precarga los importes conocidos aplicables a esa fecha.

El desglose anterior a la primera tarifa ya no exige volver a registrar un margen conocido: usa primero el `marginSnapshot` del mes, o la configuración anual cuando no existe snapshot. Si no se registró precio público, se persiste explícitamente `tariffFrom: null` y `publicPriceSnapshot: null`, manteniendo el margen. No se representa como precio cero. La ganancia incluye todos los tramos; venta al público y empresa incluyen subtotales conocidos y unidades sin precio. Las tarifas completas ya existentes se reutilizan con sus valores reales. No hay migración al abrir la aplicación ni distribución diaria automática; el usuario confirma el reparto mensual y conserva sus totales.

Este formato requiere publicar conjuntamente el frontend y las reglas candidatas: la única ampliación de reglas admite ese tramo sin precio público cuando su margen coincide exactamente con el snapshot raíz de la venta. Conserva `appAccess`, aislamiento por UID, totales, snapshots inmutables y límites de dos tramos/24 vigencias. Los respaldos nuevos son v4; se aceptan v1, v2 y v3 y se conservan los valores nulos en la restauración. No usar clientes anteriores para editar nuevos desgloses v4. No se modifican los precios cargados ni las ventas reales mediante esta revisión.


### Revisión general de uso

La navegación distingue Resumen, Ventas, Precios y márgenes e Informes y respaldos. El año se selecciona directamente; Gastos fijos muestra el mes desde el que se aplican cambios y evita sugerir que depende del año consultado. Los resúmenes principales preceden al detalle, y las tablas de importes y valores de gráficos se pueden desplegar cuando hacen falta.

Ventas y gastos muestran validaciones y errores de guardado junto al formulario, conservan el borrador al fallar y bloquean controles durante el guardado. Los filtros tienen una salida explícita y distinguen resultados vacíos de ausencia de datos. Excel y JSON explican sus propósitos distintos; se mantienen las comprobaciones y los dos pasos de restauración. Se añadieron foco visible, acceso directo al contenido, tamaños táctiles y respeto por movimiento reducido. Los borradores no se persisten entre recargas ni cambios de sección.

Validación de esta revisión: lint, TypeScript, build y presupuesto de bundle; 44 pruebas unitarias, 28 de interfaz y 26 de reglas en emulador. Revisión visual e interacción en Chrome del Mac, escritorio y viewport móvil 390×844, usando exclusivamente un entorno local con datos sintéticos y persistencia en memoria. La restauración real se probó en emulador; la revisión visual no hizo escrituras ni restauraciones en producción.
