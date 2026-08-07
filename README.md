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

## Validación

```bash
npm run lint
npm run test:unit
npm run build
```

Las pruebas de reglas usan el emulador de Firestore y requieren Java 11 o superior:

```bash
npm run test:rules
```

`npm run check` ejecuta lint, pruebas unitarias y build. Las pruebas de reglas se mantienen separadas porque arrancan el emulador y requieren Java.

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
- El JSON es un respaldo completo y fresco, leído directamente del servidor. Incluye todos los años, IDs y timestamps de las seis colecciones conocidas, pero no incluye UID ni email.

Antes de restaurar, el archivo completo se valida. La restauración combina documentos por ID en la cuenta autenticada y nunca borra documentos existentes. Los lotes son idempotentes: si una operación se interrumpe después de aplicar un lote, se puede reintentar el mismo archivo. Siempre verifica la cuenta de destino que muestra la confirmación.

## Reglas e índices de Firestore

`firestore.rules` aplica aislamiento por UID, esquemas y rangos estrictos, timestamps de servidor, snapshots de margen inmutables y denegación por defecto. `firestore.indexes.json` contiene los índices de las consultas de ventas, metas e historial.

Orden seguro para producción:

1. Descarga un respaldo completo y verifica su cantidad de documentos.
2. Selecciona explícitamente el proyecto correcto y despliega primero los índices; son aditivos y la aplicación los necesita para cargar todas las consultas sin ocultar errores. Espera a que Firebase los muestre como habilitados antes de seguir.
3. Publica esta versión de la aplicación y confirma que las ventas nuevas escriben `marginSnapshot`.
4. Ejecuta `npm run test:rules` contra el emulador.
5. Despliega las reglas nuevas:

```bash
npx firebase-tools use <project-id>
npx firebase-tools deploy --only firestore:indexes
# Después de publicar y verificar la app:
npx firebase-tools deploy --only firestore:rules
```

No actives las reglas nuevas antes de publicar el cliente actualizado: una versión antigua no envía `marginSnapshot` y sus escrituras de ventas serán rechazadas.
