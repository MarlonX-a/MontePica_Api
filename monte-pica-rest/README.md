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
