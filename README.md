# MontePica Backend

API REST construida con NestJS, PostgreSQL y TypeORM. Incluye autenticación, catálogo, operación diaria, inventario, mesas, pedidos locales y a domicilio, pagos, devoluciones, puntos, canjes y cierres de caja y jornada hasta la etapa 11B. Swagger está disponible en `/docs`.

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

| Variable       | Uso                             | Valor local de ejemplo                         |
| -------------- | ------------------------------- | ---------------------------------------------- |
| `NODE_ENV`     | Entorno de ejecución            | `development`                                  |
| `PORT`         | Puerto HTTP de la API           | `3000`                                         |
| `DB_HOST`      | Servidor PostgreSQL             | `127.0.0.1`                                    |
| `DB_PORT`      | Puerto PostgreSQL               | `5432`                                         |
| `DB_USERNAME`  | Usuario exclusivo de la API     | `monte_pica_app`                               |
| `DB_PASSWORD`  | Contraseña del usuario          | La que configuraste                            |
| `DB_NAME`      | Base de datos de la aplicación  | `monte_pica`                                   |
| `DB_LOGGING`   | Consultas SQL en el log         | `false`                                        |
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

| Rol      | Permisos administrativos                                      |
| -------- | ------------------------------------------------------------- |
| `admin`  | Usuarios, consulta de roles, catálogo y visibilidad.          |
| `worker` | Consulta administrativa del catálogo y cambio de visibilidad. |
| `client` | Sin rutas administrativas.                                    |

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

| Endpoint                                                                                               | Permiso                | Uso                                                            |
| ------------------------------------------------------------------------------------------------------ | ---------------------- | -------------------------------------------------------------- |
| `GET /api/v1/admin/operating-days?page=1&limit=20&status=open&fromDate=2026-10-01&toDate=2026-10-31`   | `inventory.read`       | Listar jornadas, de la más reciente a la más antigua.          |
| `GET /api/v1/admin/operating-days/:dayId/inventory?search=ceviche&categoryId=<uuid>&initialized=false` | `inventory.read`       | Listar existencias y productos pendientes.                     |
| `GET /api/v1/admin/operating-days/:dayId/inventory/:productId`                                         | `inventory.read`       | Consultar un producto en la jornada.                           |
| `GET /api/v1/admin/operating-days/:dayId/inventory/movements?productId=<uuid>&type=waste`              | `inventory.read`       | Consultar movimientos de la jornada.                           |
| `POST /api/v1/admin/operating-days/:dayId/inventory/initialize`                                        | `inventory.initialize` | Inicializar productos por lote.                                |
| `POST /api/v1/admin/operating-days/:dayId/inventory/:productId/movements`                              | `inventory.move`       | Registrar reposición, consumo interno, obsequio o desperdicio. |
| `POST /api/v1/admin/operating-days/:dayId/inventory/:productId/adjustments`                            | `inventory.adjust`     | Ajustar con un conteo físico.                                  |

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
{
  "type": "waste",
  "quantity": 2,
  "reason": "Porciones descartadas por deterioro"
}
```

```json
{ "countedQuantity": 15, "reason": "Corrección después del conteo físico" }
```

Las escrituras solo se aceptan en la jornada abierta correspondiente a la fecha actual de la zona horaria operativa. Las existencias no pueden quedar por debajo de las unidades reservadas. La clave idempotente conserva la respuesta original para solicitudes repetidas del mismo usuario, ruta y contenido; usarla con un contenido distinto responde `409`. Movimiento, saldo, auditoría e idempotencia se guardan en una transacción. Los movimientos no se pueden editar ni eliminar.

## Etapa 5A: sesiones invitadas y acceso seguro por QR

Esta entrega permite identificar al cliente y resolver el QR de una visita. La Etapa 5B añade las solicitudes, aprobaciones y cuentas de participantes descritas más adelante.

Usa las migraciones existentes cuando vayas a habilitar esta etapa en tu entorno. No se ejecutan al arrancar y `synchronize` permanece desactivado. Las credenciales del `.env` deben apuntar a la base que quieras usar.

| Endpoint                                   | Identidad o permiso                      | Respuesta                                                             |
| ------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------- |
| `POST /api/v1/guest-sessions`              | Público, máximo 10 solicitudes/minuto/IP | `201`, `{ client: { id, name, phone }, token, sessionId, expiresAt }` |
| `DELETE /api/v1/guest-sessions/current`    | Bearer `guest_` vigente                  | `204`; revoca la sesión invitada                                      |
| `GET /api/v1/admin/tables?page=1&limit=20` | JWT, `tables.read`                       | Lista paginada de mesas                                               |
| `POST /api/v1/admin/tables`                | JWT, `tables.manage`                     | Crea mesa con `{ "code": "M01" }`                                     |
| `POST /api/v1/admin/tables/:id/visits`     | JWT, `visits.manage`                     | `201`, `{ id, status, openedAt }`; invalida QR anterior               |
| `POST /api/v1/admin/visits/:id/qr`         | JWT, `visits.manage`                     | `201`, `{ visitId, qrToken, qrVersion }`                              |
| `POST /api/v1/table-access/resolve`        | JWT de cliente o Bearer `guest_`         | `200`, `{ visitId, tableId, tableCode, qrVersion }`                   |

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

## Etapa 5B: participantes y cierre de visitas

Un cliente registrado o invitado solicita acceso a una visita con su QR. El personal aprueba la solicitud y la API crea su cuenta individual local. El cliente consulta únicamente sus propias participaciones y su cuenta; el personal consulta los participantes de una visita.

| Endpoint                                                          | Acceso                | Uso                                                                       |
| ----------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------- |
| `POST /api/v1/visits/:id/participants`                            | Cliente o invitado    | Solicitar ingreso con `{ "qrToken": "<token>", "alias": "María" }`        |
| `GET /api/v1/me/participants` y `GET /api/v1/me/participants/:id` | Cliente o invitado    | Listar y consultar participaciones propias y su cuenta                    |
| `POST /api/v1/me/participants/:id/leave`                          | Cliente o invitado    | Cancelar solicitud pendiente o finalizar participación y cerrar la cuenta |
| `GET /api/v1/admin/visits` y `GET /api/v1/admin/visits/:id`       | `visits.read`         | Consultar visitas actuales e históricas                                   |
| `GET /api/v1/admin/visits/:id/participants`                       | `participants.manage` | Consultar participantes de una visita                                     |
| `POST /api/v1/admin/participants/:id/approve`                     | `participants.manage` | Aprobar solicitud y crear cuenta                                          |
| `POST /api/v1/admin/participants/:id/reject`                      | `participants.manage` | Rechazar solicitud con `{ "reason": "Motivo" }`                           |
| `POST /api/v1/admin/participants/:id/finish`                      | `participants.manage` | Finalizar participación aprobada y cerrar su cuenta                       |
| `POST /api/v1/admin/visits/:id/close`                             | `visits.manage`       | Cerrar visita, participantes y cuentas                                    |
| `GET /api/v1/admin/tables/:id`                                    | `tables.read`         | Consultar una mesa y su visita abierta                                    |
| `PATCH /api/v1/admin/tables/:id`                                  | `tables.manage`       | Actualizar `{ "code": "M01", "active": true }`                            |

Las listas devuelven `{ items, total, page, limit }`, con página 1 y límite 20 por defecto, máximo 100. Visitas admite `tableId`, `operatingDayId` y `status`; participantes admite `status` (`pending`, `approved`, `rejected`, `cancelled`, `finished`). Las solicitudes, transiciones y cierre de visita requieren `Idempotency-Key` de 1 a 128 caracteres. Repetirla con los mismos datos devuelve la respuesta original; reutilizarla con otros datos devuelve `409`.

Para probar desde Swagger, abre la jornada y visita y emite el QR como se indica en la Etapa 5A. Con el JWT de un cliente registrado o el token invitado en `client-token`, solicita ingreso con el QR y guarda el `id` de la participación. Con el JWT de administrador o trabajador en `access-token`, aprueba ese `id` y consulta la cuenta creada. De nuevo con `client-token`, consulta `/me/participants` y finaliza con `/leave`; el personal también puede finalizar o cerrar toda la visita.

Crear y aprobar solicitudes exige mesa activa y jornada abierta de la fecha operativa actual. La sesión invitada que originó una solicitud debe seguir vigente al aprobarla. Renovar el QR cancela las solicitudes pendientes. Salida, finalización y cierre también se permiten en visitas de fechas anteriores. Los estados finales conservan su historial y no se reabren en la misma visita. El trabajador puede consultar y operar visitas y participantes; solo el administrador puede editar mesas.

Las cuentas están vacías hasta implementar pedidos. La identidad del cliente procede del token, no de campos de la solicitud. Las operaciones, sus eventos de auditoría y sus respuestas idempotentes se guardan en una transacción; el QR no se guarda en texto en auditoría ni idempotencia. No se añade una migración en esta entrega: utiliza las tablas de la migración `1793600000000-CreateTableVisits`.

## Etapa 6A: pedidos en el local

Un cliente o invitado con participación aprobada puede enviar un pedido para su propia cuenta con `POST /api/v1/visits/:id/orders`, usando el token de cliente y el encabezado `Idempotency-Key`. El cuerpo es, por ejemplo:

```json
{
  "items": [
    { "productId": "UUID-del-producto", "quantity": 2, "notes": "Sin picante" }
  ],
  "notes": "Para compartir"
}
```

Las observaciones son opcionales. La API obtiene los precios del catálogo, guarda los importes históricos y reserva las existencias de productos con inventario. El pedido completo se rechaza si falta stock. Repetir la misma clave y cuerpo devuelve la respuesta original.

El cliente consulta `GET /api/v1/me/orders` y `GET /api/v1/me/orders/:id`. Administradores y trabajadores pueden consultar `GET /api/v1/admin/orders` y `GET /api/v1/admin/orders/:id` con el permiso `orders.read`. Las listas aceptan `page`, `limit` y `visitId`; la administrativa también admite `tableId` y `operatingDayId`.

Para probar desde Swagger, aplica la migración en la base de prueba, abre una jornada, inicializa el inventario, abre una visita y aprueba un participante según la etapa 5B. Autoriza el token del cliente y envía el pedido. Las cuentas con consumo pendiente no se pueden cerrar: las reservas se resolverán en la etapa 6B.

## Etapa 6B: edición y preparación de pedidos

La configuración `localOrderEditSeconds` se consulta y actualiza en `/api/v1/admin/operations/settings` (0 a 3600 segundos; inicial 300). El plazo se fija al crear el pedido. El cliente consulta `editableUntil` y `canEdit` y puede reemplazar su pedido mediante `PUT /api/v1/me/orders/:id` con `Idempotency-Key` y este cuerpo:

```json
{
  "expectedVersion": 1,
  "items": [{ "productId": "UUID-del-producto", "quantity": 2 }],
  "notes": "Para compartir"
}
```

El personal con `orders.manage` usa `POST /api/v1/admin/orders/:id/start-preparation`, `/ready` y `/deliver`, cada uno con `Idempotency-Key` y `{ "expectedVersion": 2 }`. Al comenzar la preparación se consume el inventario reservado. Cliente y personal pueden anular un pedido `submitted` mediante `POST /api/v1/me/orders/:id/cancel` o `POST /api/v1/admin/orders/:id/cancel`, enviando `{ "expectedVersion": 1, "reason": "Motivo" }` y una clave idempotente; la anulación libera las reservas.

Para probar el flujo en Swagger, inicia sesión como personal y abre jornada y visita; crea un invitado o inicia sesión como cliente, solicita y recibe aprobación, y envía el pedido como se indica en la etapa 6A. Configura `client-token` para editar o anular y `access-token` para preparar, marcar listo y entregar. Las versiones e historial están en `GET /api/v1/me/orders/:id/history` y `GET /api/v1/admin/orders/:id/history`. Las listas aceptan el filtro `status`.

## Etapa 7A: cuentas y liquidaciones

El cliente o invitado consulta sus cuentas en `GET /api/v1/me/accounts`, su consumo en `GET /api/v1/me/accounts/:id` y una liquidación en `GET /api/v1/me/settlements/:id`, usando `client-token`. Los importes son centavos en USD y representan consumo pendiente de cobro.

El personal con `accounts.read` consulta `/api/v1/admin/accounts` y `/api/v1/admin/accounts/:id`. Con `settlements.read` consulta `/api/v1/admin/settlements` y `/api/v1/admin/settlements/:id`. Las listas aceptan `page` y `limit`, además de los filtros documentados en Swagger.

Para preparar una liquidación, entrega todos los pedidos de la cuenta, abre la caja de la jornada actual y usa `POST /api/v1/admin/accounts/:id/settlements` con `access-token`, cuerpo `{}` e `Idempotency-Key`. Se conservan cantidades y precios del pedido. Mientras la liquidación esté pendiente, no se permiten pedidos nuevos en esa cuenta.

Para anularla, usa `POST /api/v1/admin/settlements/:id/cancel` con `Idempotency-Key` y `{ "reason": "Motivo" }`. Los detalles se conservan en el historial y la cuenta vuelve a admitir pedidos cuando las condiciones operativas lo permitan. La anulación no elimina el consumo ni registra pagos. El cobro se incorporará en la etapa 7B.

## Etapa 7B: cobro en efectivo

Después de preparar la liquidación como se indica en la etapa 7A, el personal con `payments.collect` puede cobrarla desde Swagger con `POST /api/v1/admin/settlements/:id/cash-payments`, `access-token`, `Idempotency-Key` y, por ejemplo, `{ "receivedCents": 1000 }`. La API obtiene el total de la liquidación, calcula el cambio y registra como ingreso únicamente el importe cobrado. La caja vinculada debe estar abierta en la jornada actual.

Para una liquidación de cero, usa `POST /api/v1/admin/settlements/:id/complete-without-payment`, cuerpo `{}` y clave idempotente. El cierre no crea un pago. En ambos casos se cierran la cuenta y la participación; el personal puede cerrar la visita cuando las demás cuentas no tengan pendientes.

El cliente consulta sus pagos en `/api/v1/me/payments` y `/api/v1/me/payments/:id` con `client-token`. El personal con `payments.read` usa `/api/v1/admin/payments` y `/api/v1/admin/payments/:id`. Las cuentas muestran consumo histórico, importe pagado y pendiente. Transferencias y devoluciones pertenecen a entregas posteriores.

## Etapa 7C: transferencias y comprobantes

### Almacenamiento local con Docker

Para desarrollo, `compose.storage.yaml` ejecuta SeaweedFS, un almacenamiento compatible con S3. PostgreSQL sigue funcionando en tu computadora. La API S3 se expone en `http://127.0.0.1:9000`, accesible solo desde la máquina local. Los archivos y sus metadatos se conservan en un volumen de Docker. Esta configuración no incluye una consola web.

Configura en `.env` `S3_ENDPOINT=http://127.0.0.1:9000`, `S3_REGION=us-east-1`, `S3_BUCKET=montepica-receipts`, `S3_PREFIX=montepica/receipts/` y `S3_FORCE_PATH_STYLE=true`. Define `S3_ACCESS_KEY_ID` y `S3_SECRET_ACCESS_KEY` con credenciales locales propias. `storage:up` genera una configuración privada de acceso en `.local/storage/`, que Git ignora. No subas las credenciales a Git.

Con Docker Desktop iniciado, ejecuta:

```bash
npm run storage:up
npm run storage:init
```

El segundo comando crea el bucket si todavía no existe. Una vez inicializado, configura `TRANSFER_PAYMENTS_ENABLED=true` en `.env` y reinicia el backend. Para detener el almacenamiento sin borrar los archivos, usa `npm run storage:stop`. Evita eliminar el volumen si necesitas conservar los comprobantes.

La etapa 7C también requiere su migración. Antes de ejecutarla, confirma que `.env` apunta a la base deseada y ejecuta `npm run migration:run`. El almacenamiento local es para desarrollo; un despliegue requiere almacenamiento privado persistente accesible desde el servidor.

Las transferencias están deshabilitadas por defecto. Para habilitarlas, configura en `.env` `TRANSFER_PAYMENTS_ENABLED=true`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` y `S3_SECRET_ACCESS_KEY`; opcionalmente configura `S3_ENDPOINT`, `S3_PREFIX` y `S3_FORCE_PATH_STYLE` para tu proveedor compatible con S3. El bucket debe ser privado. Comprueba con tu proveedor la escritura, lectura y eliminación de un objeto antes de usar esta función con comprobantes reales.

Con la caja y la liquidación abiertas, el cliente o invitado envía el comprobante desde Swagger mediante `POST /api/v1/me/settlements/:id/transfer-payments`, `client-token`, `Idempotency-Key` y un archivo `file` en multipart. El personal puede usar `POST /api/v1/admin/settlements/:id/transfer-payments` con `access-token`. Se aceptan JPEG, PNG o PDF de hasta 5 MiB.

El personal descarga el archivo con `GET /api/v1/admin/payments/:id/receipt` y, tras verificar el ingreso, confirma mediante `POST /api/v1/admin/payments/:id/confirm` con `{ "bankOperationReference": "REFERENCIA" }`, o rechaza con `POST /api/v1/admin/payments/:id/reject` y `{ "reason": "Motivo" }`. Las decisiones requieren `Idempotency-Key`. El cliente puede descargar su comprobante desde `GET /api/v1/me/payments/:id/receipt`.

Un rechazo conserva el historial y permite otro intento o un cobro en efectivo. Una transferencia pendiente bloquea otros cobros y la anulación de la liquidación. Confirmar cierra la cuenta y participación; no registra efectivo en caja.

Para eliminar objetos huérfanos de más de 24 horas, con la configuración S3 y de PostgreSQL del entorno correcto, ejecuta `npm run receipts:reconcile`. El comando solo inspecciona el prefijo configurado, comprueba referencias en la base y muestra cuántos objetos revisó y eliminó.

## Etapa 8A: cobertura de domicilios

El administrador configura una versión mediante `PUT /api/v1/admin/delivery/settings` con `access-token`, `Idempotency-Key` y, por ejemplo, `{ "enabled": true, "coverageDescription": "Centro", "shippingFeeCents": 250 }`. La tarifa está expresada en centavos; cero permite envío gratuito. La configuración inicial está deshabilitada. Consulta la versión pública en `GET /api/v1/delivery/settings`.

Con la jornada abierta, un cliente registrado configura su JWT en `client-token` y envía `POST /api/v1/me/delivery-requests` con `Idempotency-Key`:

```json
{
  "configurationVersion": 2,
  "recipientName": "María",
  "phone": "0987654321",
  "address": "Calle principal 123",
  "references": "Casa azul",
  "latitude": -0.2,
  "longitude": -80.1
}
```

Referencias son opcionales; latitud y longitud se envían juntas o se omiten. El cliente consulta `/api/v1/me/delivery-requests` y su detalle por ID, o cancela con `POST /api/v1/me/delivery-requests/:id/cancel`. El personal con `delivery.read` consulta `/api/v1/admin/delivery-requests`; con `delivery.review` aprueba mediante `POST /api/v1/admin/delivery-requests/:id/approve` o rechaza mediante `/reject` con `{ "reason": "Motivo" }`. Las decisiones y cancelación requieren `Idempotency-Key`.

La aprobación conserva la tarifa de la solicitud. `usableToday` indica si sigue vigente en la jornada y configuración actuales. Cambiar la configuración impide aprobar solicitudes pendientes de la versión anterior. Esta etapa revisa cobertura; todavía no crea pedidos ni cobros a domicilio.

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

## Etapa 8B: pedido a domicilio con transferencia anticipada

Aplicar las migraciones por separado, después de revisar la base de destino. La implementación y las pruebas no aplican migraciones en MontePica. Se requiere PostgreSQL local, jornada y caja actuales abiertas y `TRANSFER_PAYMENTS_ENABLED=true`; para cargar comprobantes también debe estar disponible el almacenamiento privado.

Recorrido en Swagger, alternando los tokens del personal y del cliente registrado:

1. Configurar domicilios y aprobar una solicitud de cobertura mediante el flujo 8A.
2. Como cliente, llamar `POST /api/v1/me/delivery-requests/{id}/orders` con `Idempotency-Key` y cuerpo `{"items":[{"productId":"UUID","quantity":1}],"notes":"Observacion"}`. La API calcula precios y tarifa, reserva inventario y crea cuenta y liquidación. Una solicitud admite un solo pedido, incluso si después se anula.
3. Consultar pedido, cuenta y liquidación mediante las rutas propias existentes. Los detalles incluyen productos, envío y total; las cuentas muestran pagado y pendiente. Los listados de pedidos y cuentas admiten `modality=local|delivery`. Las direcciones se exponen solamente en el detalle del pedido.
4. Enviar el comprobante con `POST /api/v1/me/settlements/{settlementId}/transfer-payments`, multipart `file`, y una clave idempotente. El personal descarga y confirma o rechaza mediante las rutas de 7C. Un rechazo permite otro intento; un comprobante pendiente no reduce la deuda.
5. Confirmar la transferencia resuelve la liquidación, pero mantiene abierta la cuenta del domicilio. Como personal, ejecutar `POST /api/v1/admin/orders/{id}/start-preparation` y después `/ready`, con `{ "expectedVersion": 1 }` y claves idempotentes diferentes. La preparación consume las reservas una sola vez y exige pago confirmado y jornada actual abierta.

Los domicilios no admiten edición, efectivo, cierre sin pago ni entrega mediante el endpoint local. El despacho y la entrega se incorporarán en 8C. El personal puede anular un pedido `submitted` con versión y motivo si no tiene pagos confirmados ni transferencias pendientes: se liberan reservas, se anula la liquidación y se cierra la cuenta en una transacción. No se permite anular directamente su liquidación. Si la caja dejó de ser válida, anular el pedido sin pagar y solicitar cobertura nuevamente. Las reservas no vencen automáticamente.

La migración `DeliveryOrders1794300000000` conserva las migraciones anteriores y rechaza su reversión si existen datos incompatibles. Las pruebas PostgreSQL aisladas comprueban subida/reversión/subida y el flujo de domicilio con almacenamiento simulado.

## Etapa 8C: despacho, entrega y vencimiento

La configuracion versionada de domicilios admite `receiptSubmissionSeconds`, entero de 60 a 86400, con valor inicial 900. Se guarda `delivery.receiptSubmissionDeadline` en cada nuevo pedido; modificar la configuracion no cambia plazos existentes. Los pedidos anteriores conservan un plazo nulo y no vencen automaticamente.

Despues de confirmar la transferencia y preparar el domicilio, el personal con `orders.manage` marca listo y ejecuta `POST /api/v1/admin/orders/{id}/dispatch`, seguido de `POST /api/v1/admin/orders/{id}/deliver`. Ambas rutas reciben `{ "expectedVersion": 1 }` y requieren claves `Idempotency-Key` distintas. El despacho exige pago confirmado, pedido listo y cuenta abierta. La entrega exige despacho previo y cierra la cuenta sin modificar inventario ni cobros. Se permiten estas dos operaciones en jornadas anteriores. El flujo local mantiene su entrega desde listo.

La carga de comprobantes comprueba el plazo con la hora de PostgreSQL antes de escribir en almacenamiento. Al vencer, un intento pendiente de revision conserva el pedido y las reservas. Confirmar ese intento conserva el flujo de pago; rechazarlo despues del vencimiento anula el pedido en la misma transaccion. Rechazarlo antes permite reintentar hasta el plazo original.

Una tarea se ejecuta al arrancar la API y cada 60 segundos. Resuelve pedidos enviados con plazo vencido y sin pago confirmado ni intento pendiente, libera reservas, anula la liquidacion y cierra la cuenta, con historial y auditoria de sistema. Cada pedido usa su propia transaccion y el bloqueo operativo PostgreSQL compartido por las instancias. Los fallos se registran y se reintentan en la siguiente ejecucion; los vencimientos acumulados durante una parada se procesan al arrancar. La API bloquea comprobantes tardios inmediatamente, aunque la liberacion de existencias espere al siguiente ciclo.

La migracion `DeliveryFulfillment1794400000000` se prueba en una base temporal y rechaza su reversion si hay datos incompatibles. No se aplica automaticamente a MontePica. Los endpoints y filtros muestran `dispatched`, fechas de despacho y entrega y el plazo del comprobante; los listados siguen omitiendo direcciones. No se incluyen repartidores, GPS, entregas fallidas ni devoluciones.

## Etapa 9A: cancelaciones revisadas y devoluciones pendientes

Clientes registrados e invitados pueden solicitar la cancelacion completa con `POST /api/v1/me/orders/{id}/cancellation-requests`, cuerpo `{ "expectedVersion": 1, "reason": "Motivo" }` e `Idempotency-Key`. El personal usa la ruta equivalente bajo `/admin/orders`. Se admiten locales preparando/listos y domicilios pagados enviados/preparando/listos. Los pedidos despachados, entregados o anulados y las transferencias pendientes de revision quedan excluidos. Para pedidos enviados sin pagar se conserva la anulacion directa.

Mientras exista una solicitud pendiente se bloquean las transiciones del pedido y nuevas liquidaciones. El cliente consulta `/me/cancellation-requests`, su detalle y puede retirar una solicitud propia mediante `POST /me/cancellation-requests/{id}/withdraw` con cuerpo vacio. El trabajador registra y consulta; solo el administrador decide con `POST /admin/cancellation-requests/{id}/approve` (cuerpo vacio) o `/reject` (`{ "reason": "Motivo" }`). Todas las escrituras requieren clave idempotente.

La aprobacion cancela el pedido, libera solo reservas activas, conserva el stock ya consumido y anula liquidaciones pendientes sin modificar pagos confirmados. Un domicilio pagado genera una devolucion pendiente por el importe total, incluido envio, y cierra su cuenta. Las rutas `/me/refunds` y `/admin/refunds`, con detalle `/{id}`, permiten consultar la autorizacion. La ejecucion efectiva se describe en 9B. La cuenta distingue `paidCents`, `refundPendingCents` y `refundedCents`.

Las decisiones admiten jornadas anteriores. Las listas usan page/limit (1/20, maximo 100), filtros y privacidad por propietario. El historial administrativo conserva responsables. La migracion CancellationRequests1794500000000 rechaza reversion si existen solicitudes o devoluciones; no se aplica a MontePica durante implementacion.

## Etapa 9B: ejecución de devoluciones

Después de aprobar la cancelación de un domicilio pagado, el administrador ejecuta la devolución autorizada completa con `POST /api/v1/admin/refunds/{id}/execute`, permiso `refunds.execute`, `Idempotency-Key` y uno de estos cuerpos:

```json
{
  "method": "transfer",
  "bankOperationReference": "DEV-000123",
  "notes": "Transferencia realizada"
}
```

```json
{
  "method": "cash",
  "recipientName": "Persona que recibió el dinero",
  "notes": "Efectivo entregado"
}
```

La API toma el importe de la autorización 9A; no admite importes parciales. La transferencia se registra como realizada fuera del sistema, normaliza y hace única la referencia y no modifica la caja. El efectivo exige caja y jornada actuales abiertas, descuenta el importe autorizado del saldo disponible y guarda una salida inmutable. El saldo se calcula como fondo inicial más pagos confirmados en efectivo menos devoluciones en efectivo; el efectivo recibido y el cambio no se contabilizan como ingreso.

El administrador y el trabajador con `refunds.read` pueden consultar devoluciones administrativas e historial. El cliente consulta solo sus devoluciones, sin ver referencia bancaria, destinatario ni datos internos del personal. La cuenta conserva el importe históricamente cobrado y muestra por separado devolución pendiente y completada. Una devolución completada no se puede modificar ni repetir.

## Etapa 10A: acumulación de puntos

El programa comienza deshabilitado. En Swagger, el administrador usa `PUT /api/v1/admin/points/settings`, `access-token`, `Idempotency-Key` y `{ "enabled": true, "pointsPerDollar": 2 }`. Cada cambio crea una versión inmutable. La tasa admite enteros de 1 a 1000. La consulta pública es `GET /api/v1/points/settings`; la administrativa incluye responsable y fecha.

Solo los clientes registrados acumulan. Por cada pago se calcula `floor(productsCents / 100) * pointsPerDollar`: el envío y las fracciones restantes no generan puntos. Los locales acumulan al cobrar en efectivo o confirmar transferencia. Los domicilios guardan la tasa al confirmar el pago y acreditan al entregar, aunque después cambie o se deshabilite el programa. Los pagos anteriores o realizados con el programa deshabilitado no se acreditan retroactivamente.

El cliente usa su JWT en `client-token` y consulta `GET /api/v1/me/points` (`balance`, `pendingPoints`) y `/api/v1/me/points/movements`. Los invitados reciben 401. Administrador y trabajador con `points.read` consultan `/api/v1/admin/clients/{id}/points` y `/movements`. El historial admite `type=earn|refundAdjustment`, `paymentId`, `page` y `limit` (1/20, máximo 100).

Cancelar un domicilio antes de entregarlo invalida la acumulación pendiente. Una devolución completada revierte los puntos históricos acreditados para su pago, si existen; autorizarla todavía no descuenta puntos. Los movimientos son inmutables y se guardan en la transacción del cobro, entrega o devolución, junto con auditoría e idempotencia. No hay canjes, vencimiento ni ajustes manuales en 10A.

La migración `PointsProgram1794700000000` debe aplicarse por separado al destino revisado. Rechaza su reversión si existen versiones modificadas, acumulaciones o movimientos. Las comprobaciones usan PostgreSQL temporal y no aplican migraciones a MontePica.

Con `operations.read`, consultar el saldo calculado de cualquier caja mediante `GET /api/v1/admin/operations/cash/{cashRegisterId}/summary`. Las transferencias se muestran separadas del efectivo físico. La conciliación y el cierre se describen en la etapa 11A.

## Etapa 10B: recompensas y canjes locales

La migración `LocalRewards1794800000000` agrega recompensas, solicitudes, reservas de puntos e inventario y los permisos `rewards.read`, `rewards.manage`, `redemptions.read` y `redemptions.manage`. La migración es reversible solo mientras no haya recompensas, solicitudes, pedidos de recompensa ni movimientos asociados. No la apliques a `MontePica` desde estas comprobaciones.

Con el token del administrador, crea una recompensa en `POST /api/v1/admin/rewards` con `Idempotency-Key` y, por ejemplo, `{"name":"Ceviche gratis","productId":"UUID","pointsCost":100,"active":true,"sortOrder":1}`. La lista pública `GET /api/v1/rewards` muestra solo recompensas activas cuyo producto y categoría sigan activos y visibles. El administrador y trabajador pueden consultar el catálogo administrativo; solo el administrador puede crear o modificar recompensas. Las ediciones usan `expectedVersion`; el producto asociado no se puede cambiar.

El cliente registrado debe tener una participación aprobada y una cuenta abierta en una visita vigente. En `POST /api/v1/visits/{visitId}/redemptions`, envía `Idempotency-Key` y `{"rewardId":"UUID","rewardVersion":1}`. Se reserva el costo de puntos y, si el producto controla inventario, una unidad de las existencias inicializadas de la jornada durante 15 minutos. Los invitados reciben `401`; la acumulación de puntos deshabilitada no impide gastar saldo ya acreditado.

El personal consulta `/api/v1/admin/redemptions`; el trabajador puede aprobar o rechazar. Aprobar con `POST /api/v1/admin/redemptions/{id}/approve` crea un pedido local de una unidad con precio cero, descuenta los puntos una vez y transfiere la reserva de inventario al pedido sin contarla dos veces. Ese pedido sigue las rutas existentes de preparación y entrega. Se puede consultar desde `/api/v1/me/orders` y se incluye como consumo de cero dólares en la liquidación. No se crea un pago ficticio ni se acumulan puntos por el canje.

Cliente y personal pueden cancelar/rechazar únicamente una solicitud pendiente; una tarea al iniciar y cada minuto libera puntos e inventario de solicitudes vencidas. Salir o cerrar una visita también libera las reservas. El cierre de la cuenta por efectivo, importe cero o transferencia local cancela los canjes pendientes dentro de la transacción del cobro. Anular un pedido de recompensa antes de prepararlo, o aprobar su cancelación mediante 9A, devuelve los puntos una sola vez. Las unidades ya consumidas no se reponen al inventario. El resumen de puntos ahora distingue `balance`, `pendingPoints`, `reservedPoints` y `availablePoints`, y su historial incluye `redeem` y `redemptionReturn`.

Todas las escrituras requieren clave idempotente. Las listas de recompensas y canjes usan `page`/`limit` (1/20, máximo 100) y los filtros documentados en Swagger. La base temporal E2E comprueba la migración; no se aplican migraciones ni se cargan datos en `MontePica` durante desarrollo.

## Etapa 11A: conciliación y cierre de caja

El administrador y el trabajador pueden consultar cajas con `GET /api/v1/admin/operations/cash?status=open&operatingDayId={uuid}`. Antes del conteo, consulta `GET /api/v1/admin/operations/cash/{id}/closing-preview`: muestra el efectivo esperado, transferencias confirmadas por separado, bloqueos y devoluciones autorizadas aún pendientes como información.

Resuelve liquidaciones sin pagar, comprobantes en revisión, consumo local sin liquidar y reservas de pedidos. Los canjes pendientes de esa jornada se cancelan y liberan con historial cuando se cierra la caja. La API vuelve a comprobar los bloqueos dentro de la transacción. Una caja cerrada ya no acepta nuevos pedidos locales ni nuevas solicitudes o aprobaciones de canje. Si todavía no se abrió una caja para una jornada, se conserva el comportamiento previo que permite pedidos locales sin caja.

Solo el administrador puede cerrar mediante `POST /api/v1/admin/operations/cash/{id}/close`, con `Idempotency-Key` y `{ "countedCents": 12500, "reason": "Diferencia revisada" }`. La justificación es obligatoria si el conteo difiere del saldo esperado. El cálculo usa fondo inicial más pagos confirmados en efectivo menos devoluciones en efectivo; el efectivo recibido y el cambio no se cuentan como ingreso. Una diferencia no crea pagos ni movimientos ficticios.

El cierre es único e inmutable. Consulta el registro guardado con `GET /api/v1/admin/operations/cash/{id}/closure`; el resumen existente y `GET /api/v1/admin/operations/current` muestran el cierre cuando se trata de la jornada actual. Cerrar caja no cierra la jornada ni las visitas. La migración `CashRegisterClosures1794900000000` se aplica por separado tras revisar el destino; su reversión se detiene si ya existen cierres. Las pruebas usan PostgreSQL temporal y no aplican migraciones a `MontePica`.

## Etapa 11B: resolución de pendientes y cierre de jornada

Consulta jornadas actuales e históricas con `GET /api/v1/admin/operating-days`. El listado incluye fecha, estado y, si ya se cerró, responsable y hora del cierre. Usa `GET /api/v1/admin/operations/days/{id}` para consultar también la caja.

Antes del cierre, `GET /api/v1/admin/operations/days/{id}/closing-preview?page=1&limit=20` devuelve los pendientes que bloquean, sus motivos e identificadores, las limpiezas automáticas previstas y las devoluciones autorizadas todavía pendientes. Resuelve pedidos sin entregar, consumo sin liquidar, liquidaciones pendientes, transferencias en revisión y solicitudes de cancelación pendientes. Una caja debe estar cerrada y conciliada si existe; una jornada sin caja puede cerrarse.

Solo el administrador puede cerrar con `POST /api/v1/admin/operations/days/{id}/close`, `Idempotency-Key` y cuerpo `{ "notes": "Cierre revisado" }` (las observaciones son opcionales, hasta 500 caracteres). En una transacción la API libera canjes pendientes, cancela solicitudes de participación pendientes, finaliza las aprobadas, cierra visitas e invalida sus QR, cancela coberturas sin pedido y guarda un resumen inmutable. Las devoluciones autorizadas pendientes se muestran como información y se pueden ejecutar después; no cambian retroactivamente el cierre. Consulta el registro con `GET /api/v1/admin/operations/days/{id}/closure`.

La apertura normal (`POST /api/v1/admin/operations/days/open`) queda bloqueada si hay jornadas anteriores abiertas. Si deben cobrarse cuentas antiguas, un administrador con `operations.openWithPendingDays` puede abrir la fecha actual con `POST /api/v1/admin/operations/days/open-with-pending-days`, `Idempotency-Key` y `{ "reason": "Recuperación de cuentas pendientes" }`. La excepción guarda el motivo y los identificadores de jornadas pendientes, sin cerrarlas ni modificarlas. Abre luego la caja actual y resuelve las cuentas antiguas con los flujos existentes. Los cierres no se pueden modificar ni reabrir. La migración `OperatingDayClosures1795000000000` es reversible únicamente antes de guardar cierres o aperturas excepcionales.

## Arquitectura por áreas con TypeORM

Cada área tiene un módulo propietario, controladores separados por acceso, servicios, `dto`, `entities` y tipos de persistencia. Cada controlador y cada DTO tienen su propio archivo. Los controladores y guards delegan en servicios, sin consultar la base directamente.

| Área                                               | Servicios y responsabilidades                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `auth`, `users`, `roles`, `guest-sessions`         | Autenticación, administración de usuarios, permisos e invitados.                                |
| `catalog`                                          | Consulta pública y administración de categorías y productos.                                    |
| `operations`, `cash`, `inventory`                  | Configuración, apertura y cierre de jornadas, caja y existencias.                               |
| `tables`, `visits`, `participants`                 | Mesas, QR, visitas y cuentas individuales.                                                      |
| `orders`, `delivery`                               | Creación, consultas, edición y transiciones de pedidos; cobertura y vencimientos de domicilios. |
| `accounts`, `settlements`, `payments`, `transfers` | Consumo, liquidaciones, cobros y comprobantes privados.                                         |
| `cancellations`, `refunds`                         | Solicitudes y decisiones de cancelación; ejecución de devoluciones.                             |
| `points`, `rewards`, `redemptions`                 | Acumulaciones, catálogo de recompensas, reservas, decisiones y vencimiento de canjes.           |

Los servicios usan `@InjectRepository`, `Repository<Entity>` y QueryBuilder. Las lecturas independientes utilizan los repositorios inyectados. Dentro de una transacción, las consultas y escrituras utilizan `manager.getRepository(Entity)` y los QueryBuilder del mismo `EntityManager`. Las expresiones de filtros, agregaciones y subconsultas permanecen parametrizadas. No existen repositorios propios ni un registro global `PersistenceModule`.

`src/database/entities.ts` contiene el registro explícito de las 51 entidades que comparten API, migraciones y comandos. Los mapeos conservan nombres físicos, relaciones, restricciones e índices del esquema migrado. Los valores `bigint` se mantienen como cadenas o enteros grandes hasta validar su rango; las respuestas usan proyecciones explícitas, sin exponer entidades completas ni secretos. La reorganización no requiere migraciones y mantiene `synchronize: false`.

`OrdersService`, `OrdersEditingService`, `OrdersLifecycleService` y `OrdersQueryService` separan creación, edición, transiciones y consultas. `OperationsSettingsService`, `OperatingDaysService` y `OperatingDayClosureService` separan configuración, apertura y cierre. Las consultas de cuentas, las liquidaciones y las devoluciones tienen sus propios servicios y módulos. Recompensas y canjes también están separados.

Las operaciones compartidas que deben confirmarse juntas reciben el administrador de su llamador: `OrderInventoryService`, `AccountLifecycleService`, `PointsLedgerService` y `RedemptionReservationsService`. No abren transacciones internas. Cada servicio tiene un único módulo propietario, que lo exporta cuando otra área lo necesita; los módulos no forman ciclos.

En `common` están los módulos de auditoría, identidad, idempotencia, almacenamiento privado y bloqueos. El caso de uso o coordinador idempotente abre la transacción. Auditoría, cambios de estado y respuesta idempotente usan el mismo administrador; la autorización se revalida antes de devolver una respuesta guardada. Se conservan claves, hashes, orden de bloqueos y compensación de archivos privados. La ejecución nativa de SQL se limita a bloqueos consultivos PostgreSQL, migraciones y la comprobación técnica de salud; las consultas de negocio utilizan TypeORM.

`DeliveryExpiryService` y `RedemptionExpiryService` se registran una sola vez y procesan cada vencimiento en su propia transacción. Los comandos `admin:create`, `seed:catalog` y `receipts:reconcile` crean un contexto de aplicación con los servicios necesarios, sin abrir HTTP ni iniciar tareas de vencimiento, y cierran su conexión al terminar.

Para añadir funcionalidades, crea o amplía el módulo del área, registra sus entidades en `TypeOrmModule.forFeature` y en el registro explícito, valida entradas mediante DTO y devuelve proyecciones de respuesta. Las operaciones internas compartidas deben recibir el `EntityManager`; evita transacciones anidadas, acceso a persistencia desde controladores o guards y registros duplicados de proveedores.

Verificación:

```powershell
npx tsc -p tsconfig.json --noEmit --incremental false
npm run lint
npm test
$env:RUN_POSTGRES_E2E='1'
npm run test:e2e
```

La suite unitaria verifica reglas y límites de arquitectura: ausencia de repositorios propios, persistencia fuera de controladores y guards, proveedores con un único propietario y módulos sin ciclos. La suite E2E crea y elimina una base PostgreSQL temporal, simula S3, verifica migraciones y compara los mapeos TypeORM con el esquema migrado sin diferencias. Las credenciales deben permitir crear esa base temporal; `MontePica` no es el destino de las migraciones ni de los datos de prueba. No ejecutes un build que borre `dist` mientras esté activo el servidor en vigilancia.
