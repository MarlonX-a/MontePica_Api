# MontePica Backend

API REST construida con NestJS, PostgreSQL y TypeORM. El backend se desarrolla por módulos; por ahora incluye configuración, conexión a PostgreSQL local, migraciones, documentación OpenAPI y comprobaciones de estado.

## Requisitos

- Node.js compatible con las dependencias del proyecto.
- PostgreSQL instalado y activo en la máquina.
- Una base y un usuario dedicados para MontePica.

La instalación local de PostgreSQL no será modificada ni se borrarán otras bases. Ejecuta una sola vez estos comandos conectado a la base `postgres` con un usuario administrador; reemplaza la contraseña de ejemplo por una propia antes de ejecutarlos:

```sql
CREATE ROLE monte_pica_app LOGIN PASSWORD 'reemplaza_esta_clave';
CREATE DATABASE monte_pica OWNER monte_pica_app;
```

Si la base o el rol ya existen, no vuelvas a ejecutar esas sentencias; comprueba la configuración existente y úsala.

## Configuración

Desde esta carpeta, crea tu archivo local de entorno:

```powershell
Copy-Item .env.example .env
```

Edita `.env` con la contraseña elegida y los datos de tu PostgreSQL. El archivo `.env` está excluido de Git. Las variables disponibles son:

| Variable | Uso | Valor local de ejemplo |
|---|---|---|
| `NODE_ENV` | Entorno de ejecución | `development` |
| `PORT` | Puerto HTTP de la API | `3000` |
| `DB_HOST` | Servidor PostgreSQL | `127.0.0.1` |
| `DB_PORT` | Puerto PostgreSQL | `5432` |
| `DB_USERNAME` | Usuario exclusivo de la API | `monte_pica_app` |
| `DB_PASSWORD` | Contraseña del usuario | La que configuraste |
| `DB_NAME` | Base de datos de la aplicación | `monte_pica` |
| `DB_LOGGING` | Consultas SQL en el log | `false` |
| `CORS_ORIGINS` | Orígenes web separados por coma | `http://localhost:8081,http://localhost:19006` |

El proceso valida la configuración al arrancar y muestra qué variable falta o es inválida. CORS queda cerrado para orígenes web que no aparezcan en `CORS_ORIGINS`; las aplicaciones móviles nativas no usan esa política del navegador.

## Instalación y ejecución

```bash
npm install
npm run build
npm run start:dev
```

La API escucha en `http://localhost:3000`. NestJS se enlaza a las interfaces de red locales para permitir solicitudes desde el emulador o dispositivo que comparta la red.

## Endpoints disponibles

- `GET /api/v1/health`: informa que el proceso HTTP está activo.
- `GET /api/v1/health/ready`: ejecuta `SELECT 1` y responde `503` si PostgreSQL no está disponible.
- `GET /docs`: interfaz Swagger para explorar los endpoints.
- `GET /docs-json`: documento OpenAPI generado.

## Catálogo (etapa 2)

Las categorías y productos se gestionan mediante migraciones; la API solo expone consultas públicas por ahora.

```bash
npm run migration:run
npm run seed:catalog
```

`seed:catalog` es opcional y solo carga ejemplos en la base indicada por `.env`. Inserta Ceviches, Bebidas y los seis productos del prototipo; puede repetirse sin duplicar ni sobrescribir registros. Los ejemplos no asignan URL de imagen ni existencias.

Endpoints disponibles:

- `GET /api/v1/categories`: categorías activas ordenadas por posición.
- `GET /api/v1/products?categoryId=<uuid>&search=ceviche&page=1&limit=20`: productos activos y visibles, con filtro de categoría y búsqueda opcionales. `limit` admite de 1 a 100.
- `GET /api/v1/products/<uuid>`: detalle de un producto visible.

El precio se entrega como entero en centavos (`650` representa USD 6.50). Las listas de productos responden `{ items, total, page, limit }`. Los productos inactivos, ocultos o asociados a una categoría inactiva no aparecen en el catálogo.

## Autenticación y permisos (etapas 3A y 3B)

Configura `JWT_ACCESS_SECRET` en `.env` con una clave aleatoria de al menos 32 bytes. Puedes crear una para el desarrollo local con:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Ejecuta `npm run migration:run` para crear roles, identidad, permisos y auditoría. El registro público crea cuentas de cliente; las cuentas del personal se crean desde el backend.

Rutas disponibles:

- `POST /api/v1/auth/register`: `{ "name": "María Zambrano", "email": "maria@example.com", "phone": "0987654321", "password": "Ejemplo123", "termsAccepted": true }`. Crea el cliente e inicia su sesión.
- `POST /api/v1/auth/login`: recibe correo y contraseña.
- `POST /api/v1/auth/refresh`: recibe `refreshToken`; cada renovación rota el token.
- `POST /api/v1/auth/logout`: recibe `refreshToken` y revoca su sesión.
- `GET /api/v1/auth/me`: requiere `Authorization: Bearer <accessToken>`.
- `POST /api/v1/auth/change-password`: requiere sesión y recibe `currentPassword` y `newPassword`. Al completarse, revoca todas las sesiones.

El token de acceso dura 15 minutos y la sesión de renovación 30 días. El usuario recibe los tokens al registrarse o iniciar sesión; la contraseña se almacena con `scrypt` y en la base solo se guarda el hash del refresh token. Las rutas de acceso, registro y renovación tienen límites por IP; los límites usan memoria local del proceso.

Las respuestas de autenticación incluyen `permissions` vigentes para el rol.

### Crear el primer administrador

Después de aplicar migraciones, desde una terminal interactiva ejecuta:

```bash
npm run admin:create
```

El comando solicita nombre, correo, teléfono opcional y contraseña dos veces, sin mostrarla al escribir. Solo funciona si todavía no existe ningún administrador, incluso si estuviera inactivo; no cambia cuentas existentes. El hash queda almacenado y la creación se registra en auditoría. No hay credenciales predeterminadas.

### Administración

Todas las rutas requieren un token de acceso. Los permisos se comprueban contra PostgreSQL en cada llamada:

| Rol | Permisos administrativos |
|---|---|
| `admin` | Usuarios, consulta de roles, catálogo y visibilidad. |
| `worker` | Consulta administrativa del catálogo y cambio de visibilidad. |
| `client` | Sin rutas administrativas. |

- `GET /api/v1/admin/roles`: roles y permisos.
- `GET /api/v1/admin/users?search=ana&roleCode=worker&active=true&page=1&limit=20`, `GET /users/:id`, `POST /users`, `PATCH /users/:id`.
- `GET /api/v1/admin/categories?search=ceviche&active=true`, `GET /categories/:id`, `POST /categories`, `PATCH /categories/:id`.
- `GET /api/v1/admin/products?search=mixto&categoryId=<uuid>&active=true&visibleInMenu=false`, `GET /products/:id`, `POST /products`, `PATCH /products/:id`.
- `PATCH /api/v1/admin/products/:id/visibility` acepta únicamente `{ "visibleInMenu": false }`; esto permite que el trabajador cambie visibilidad sin editar precios ni productos.

Las listas usan `{ items, total, page, limit }`, con `page=1`, `limit=20` por defecto y máximo 100. Al crear un usuario se envía `name`, `email`, `roleCode`, `initialPassword` y `phone` opcional. Para editar solo se aceptan nombre, correo, teléfono, rol y estado; las contraseñas nunca se exponen ni se cambian desde administración. El SKU se normaliza a minúsculas y no se puede modificar. Los precios son enteros en centavos. El inventario disponible y sus movimientos se añadirán en una etapa posterior.

Las modificaciones administrativas y los cambios de contraseña registran auditoría dentro de la misma transacción. Cambiar correo, rol, estado o contraseña revoca las sesiones afectadas. Un administrador no puede cambiar su propio rol ni suspenderse, y la aplicación protege al último administrador activo.

## Etapa 4A: configuración operativa y apertura

La configuración operativa guarda la zona horaria del negocio y sus horas habituales de apertura y cierre. La zona horaria determina la fecha de negocio que se usa al abrir y consultar una jornada. Las horas son informativas en esta entrega; todavía no bloquean aperturas fuera de ese horario.

Después de aplicar las migraciones, las cuentas con permisos pueden usar:

- `GET /api/v1/admin/operations/settings`: configuración actual (`operations.read`).
- `PATCH /api/v1/admin/operations/settings`: actualizar `timeZone`, `openingTime` o `closingTime` (`operations.manage`). Las horas usan `HH:mm` y la zona debe ser un identificador IANA, por ejemplo `America/Guayaquil`.
- `GET /api/v1/admin/operations/current`: consultar la jornada y caja de la fecha operativa actual (`operations.read`).
- `POST /api/v1/admin/operations/days/open`: abrir la jornada del día en la zona horaria configurada (`operations.open`). Solo se permite una jornada por fecha.
- `POST /api/v1/admin/operations/cash/open`: abrir la caja de la jornada abierta con `{ "openingAmountCents": 5000 }` (`operations.open`). El fondo inicial se registra en centavos de USD; solo existe una caja por jornada en esta etapa.

El administrador recibe `operations.read`, `operations.manage` y `operations.open`. El trabajador puede consultar el estado y abrir jornada/caja. Clientes no tienen estos permisos. Las aperturas y cambios de configuración quedan auditados dentro de la transacción correspondiente. Esta etapa no incluye movimientos de efectivo, cierre de caja ni inventario.

## Etapa 4B: inventario diario

Aplica las migraciones pendientes con `npm run migration:run`. El inventario se controla por jornada y producto. Cada producto con `tracksInventory: true` se inicializa explícitamente; una existencia no inicializada se devuelve con las cantidades en `null`, mientras que `0` indica un conteo inicial de cero. No se copian cantidades de otra jornada.

Las rutas requieren JWT y los permisos indicados. El trabajador puede consultar y registrar movimientos ordinarios; solo el administrador puede inicializar productos o corregir saldos por conteo físico.

| Endpoint | Permiso | Uso |
|---|---|---|
| `GET /api/v1/admin/operating-days?page=1&limit=20&status=open&fromDate=2026-10-01&toDate=2026-10-31` | `inventory.read` | Listar jornadas, de la más reciente a la más antigua. |
| `GET /api/v1/admin/operating-days/:dayId/inventory?search=ceviche&categoryId=<uuid>&initialized=false` | `inventory.read` | Listar existencias y productos pendientes. |
| `GET /api/v1/admin/operating-days/:dayId/inventory/:productId` | `inventory.read` | Consultar un producto en la jornada. |
| `GET /api/v1/admin/operating-days/:dayId/inventory/movements?productId=<uuid>&type=waste` | `inventory.read` | Consultar movimientos de la jornada. |
| `POST /api/v1/admin/operating-days/:dayId/inventory/initialize` | `inventory.initialize` | Inicializar productos por lote. |
| `POST /api/v1/admin/operating-days/:dayId/inventory/:productId/movements` | `inventory.move` | Registrar reposición, consumo interno, obsequio o desperdicio. |
| `POST /api/v1/admin/operating-days/:dayId/inventory/:productId/adjustments` | `inventory.adjust` | Ajustar con un conteo físico. |

Todas las listas usan `{ items, total, page, limit }`; `page` inicia en 1 y `limit` por defecto es 20, máximo 100. En cada fila se devuelven `initialQuantity`, `physicalQuantity`, `reservedQuantity` y `availableQuantity`. Las unidades reservadas empiezan en cero y no cambian hasta que se implemente la reserva por pedidos.

Ejemplos de escritura (todos requieren la cabecera `Idempotency-Key` con una clave única para la operación):

```http
POST /api/v1/admin/operating-days/<dayId>/inventory/initialize
Idempotency-Key: initialize-2026-10-27
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "items": [
    { "productId": "<productUuid>", "initialQuantity": 20 },
    { "productId": "<anotherProductUuid>", "initialQuantity": 0 }
  ]
}
```

```json
{ "type": "waste", "quantity": 2, "reason": "Porciones descartadas por deterioro" }
```

```json
{ "countedQuantity": 15, "reason": "Corrección después del conteo físico" }
```

Las escrituras solo se aceptan en la jornada abierta correspondiente a la fecha actual de la zona horaria operativa. Las existencias no pueden quedar por debajo de las unidades reservadas. La clave idempotente conserva la respuesta original para solicitudes repetidas del mismo usuario, ruta y contenido; usarla con un contenido distinto responde `409`. Movimiento, saldo, auditoría e idempotencia se guardan en una transacción. Los movimientos no se pueden editar ni eliminar.

## Etapa 5A: sesiones invitadas y acceso seguro por QR

Esta entrega permite identificar al cliente y resolver el QR de una visita. Las solicitudes, aprobaciones y cuentas de participantes se completarán en la Etapa 5B; todavía no tienen rutas disponibles.

Usa las migraciones existentes cuando vayas a habilitar esta etapa en tu entorno. No se ejecutan al arrancar y `synchronize` permanece desactivado. Las credenciales del `.env` deben apuntar a la base que quieras usar.

| Endpoint | Identidad o permiso | Respuesta |
|---|---|---|
| `POST /api/v1/guest-sessions` | Público, máximo 10 solicitudes/minuto/IP | `201`, `{ client: { id, name, phone }, token, sessionId, expiresAt }` |
| `DELETE /api/v1/guest-sessions/current` | Bearer `guest_` vigente | `204`; revoca la sesión invitada |
| `GET /api/v1/admin/tables?page=1&limit=20` | JWT, `tables.read` | Lista paginada de mesas |
| `POST /api/v1/admin/tables` | JWT, `tables.manage` | Crea mesa con `{ "code": "M01" }` |
| `POST /api/v1/admin/tables/:id/visits` | JWT, `visits.manage` | `201`, `{ id, status, openedAt }`; invalida QR anterior |
| `POST /api/v1/admin/visits/:id/qr` | JWT, `visits.manage` | `201`, `{ visitId, qrToken, qrVersion }` |
| `POST /api/v1/table-access/resolve` | JWT de cliente o Bearer `guest_` | `200`, `{ visitId, tableId, tableCode, qrVersion }` |

El trabajador puede listar mesas, abrir visitas y emitir QR. El administrador también puede crear mesas. El cliente registrado y el invitado resuelven el QR; el personal no puede usar esa ruta como cliente (`403`). Los invitados no pueden acceder a administración (`401`).

Recorrido desde Swagger:

1. Inicia sesión como administrador y configura `access-token` en **Authorize** con su JWT.
2. Abre la jornada con `POST /api/v1/admin/operations/days/open`. Se usa la fecha actual en la zona horaria operativa; no se exige abrir caja.
3. Crea una mesa, abre su visita y emite el QR mediante las rutas administrativas de la tabla anterior. Guarda `qrToken`: se entrega una sola vez.
4. Crea un invitado con `POST /api/v1/guest-sessions` y `{ "name": "Invitado de prueba", "phone": "0987654321" }`. El teléfono es opcional. El nombre se recorta y admite de 1 a 160 caracteres; el teléfono, hasta 20. No se aceptan campos adicionales.
5. Configura `client-token` en **Authorize** con el token `guest_` recibido. También puedes usar el JWT de un cliente registrado en este esquema.
6. Envía `{ "qrToken": "<token-del-QR>" }` a `POST /api/v1/table-access/resolve` para consultar la visita y mesa.
7. Revoca al invitado con `DELETE /api/v1/guest-sessions/current`. Las llamadas posteriores con ese token responderán `401`.

Las sesiones invitadas duran 24 horas, sin renovación, y sus tokens se almacenan exclusivamente como hash. Las sesiones desconocidas, vencidas o revocadas responden `401`. Un QR desconocido, renovado o de una visita anterior responde `404`; una visita cuya mesa está inactiva o cuya jornada está cerrada o fuera de la fecha actual responde `409`. Los UUID, cuerpos y parámetros inválidos responden `400`. La emisión requiere las mismas condiciones operativas.

Renovar el QR incrementa su versión y cancela las solicitudes pendientes, conservando los participantes aprobados. Apertura, emisión, cancelación de pendientes y auditoría se coordinan mediante transacciones y los bloqueos de operaciones existentes. Si falla la auditoría, se revierte la modificación. No se guardan tokens ni hashes en auditoría; el logger de consultas omite valores de parámetros incluso con `DB_LOGGING=true`.

La suite PostgreSQL es opcional y crea una base temporal `mp_qr_test_<uuid>` usando el servidor y las credenciales de `.env` contra la base administrativa `postgres`. Requiere permiso `CREATEDB`, ejecuta y revierte migraciones solo en esa base temporal, prueba el flujo HTTP y elimina la base al finalizar. No utiliza `DB_NAME` para sus pruebas ni aplica migraciones a `MontePica`.

```powershell
$env:RUN_POSTGRES_E2E = '1'
npm run test:e2e
Remove-Item Env:RUN_POSTGRES_E2E
```

## Migraciones

La sincronización automática del esquema está desactivada. Las tablas se añadirán mediante migraciones conforme se implementen los módulos del negocio.

```bash
# Crear una migración vacía para editar manualmente
npm run migration:create -- src/database/migrations/NombreDeLaMigracion

# Generar una migración a partir de diferencias entre entidades y esquema
npm run migration:generate -- src/database/migrations/NombreDeLaMigracion

# Consultar, ejecutar o revertir migraciones
npm run migration:show
npm run migration:run
npm run migration:revert
```

La generación requiere que ya existan entidades de TypeORM y cambios detectables. Revisa cada migración generada antes de aplicarla. Las tablas de negocio no se crean automáticamente.

## Comprobaciones

```bash
npm run build
npm test
npm run test:e2e
```

## Integracion continua

GitHub Actions ejecuta estas comprobaciones en cada push y pull request hacia `main`, usando Node.js 24: compilacion, lint, pruebas de login, permisos, administracion, catalogo y configuracion, ademas de las pruebas E2E de salud y contratos de la API.

Las pruebas de los endpoints de estado usan una conexión simulada para comprobar la respuesta HTTP y el documento OpenAPI sin depender de credenciales locales. Para comprobar PostgreSQL real, configura `.env`, inicia la API y consulta `/api/v1/health/ready`.
