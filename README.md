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

Las pruebas de los endpoints de estado usan una conexión simulada para comprobar la respuesta HTTP y el documento OpenAPI sin depender de credenciales locales. Para comprobar PostgreSQL real, configura `.env`, inicia la API y consulta `/api/v1/health/ready`.
