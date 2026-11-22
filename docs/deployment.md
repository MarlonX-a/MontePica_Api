## Recuperación de contraseña

Con `PASSWORD_RECOVERY_ENABLED=true` y SMTP configurado, un usuario activo puede pedir un código con `POST /api/v1/auth/forgot-password` y `{"email":"maria@example.com"}`. El `202` es igual para correos existentes, desconocidos y solicitudes que superen el límite de 20 por IP o 3 por correo por hora. El trabajador de correo reintenta hasta tres veces. El mensaje trae un código de 15 minutos.

Copia el código del correo en Swagger u otro cliente y envía `POST /api/v1/auth/reset-password` con `{"token":"<código>","newPassword":"NuevaClave123"}`. Se aplica la misma política del cambio autenticado. Un `204` confirma el cambio y revoca las sesiones. Un código vencido, sustituido o usado devuelve `400`. El máximo de confirmaciones es 20 por IP por hora (`429`).

## Despliegue y recuperación operativa

1. Aprovisiona un entorno de pruebas con Node.js 24, una base PostgreSQL dedicada, un bucket S3 privado y un servidor SMTP de pruebas con TLS. Usa una dirección de correo bajo tu control. Separa credenciales y almacenamiento por entorno.
2. Configura las variables del proceso según `.env.example`. Usa `NODE_ENV=production`, un secreto JWT aleatorio, `DB_TLS=true` y el nombre de servidor contenido en el certificado de PostgreSQL. Si la CA es privada, coloca su PEM en `DB_TLS_CA` (admite saltos de línea escapados como `\n`). Configura `TRUST_PROXY` con las IP o redes CIDR reales de los proxies que limpian `X-Forwarded-For`. Vacío equivale a conexión directa. Configura los orígenes HTTPS de la interfaz web en `CORS_ORIGINS`. Swagger se deshabilita por defecto en producción.
3. Configura `SMTP_HOST`, `SMTP_FROM` y, cuando corresponda, el par `SMTP_USER` / `SMTP_PASSWORD`. Usa `SMTP_PORT=465` y `SMTP_SECURE=true` para TLS implícito, o puerto 587 y `SMTP_SECURE=false` para STARTTLS. Para probar transferencias, habilita `TRANSFER_PAYMENTS_ENABLED` y configura las variables S3. Restringe el acceso a objetos al usuario de servicio y bloquea el acceso público en el proveedor.
4. Desde el artefacto del commit que se probará, ejecuta los siguientes comandos. La migración se ejecuta una vez por entorno como paso de despliegue, antes de iniciar las instancias. Ejecuta la creación del administrador desde una terminal interactiva, solo en una instalación nueva.

   ```sh
   npm ci --ignore-scripts
   npm run build
   npm run migration:run:prod
   npm run migration:show:prod
   npm run admin:create:prod
   npm run start:prod
   ```

5. Configura el monitoreo HTTP con `/api/v1/health` para el proceso y `/api/v1/health/ready` para PostgreSQL. Envía `SIGTERM` desde el supervisor para apagar la aplicación de forma ordenada.
6. En pruebas, recupera una contraseña y confirma que la sesión anterior queda revocada. Completa un pedido local hasta conciliar caja y cerrar jornada. Completa un domicilio pagado con transferencia hasta la entrega y verifica que solo usuarios autorizados puedan descargar el comprobante. Conserva el SHA desplegado, la ejecución de CI y el estado de SonarCloud.
7. Antes de migrar, crea un respaldo de PostgreSQL y comprueba que se restaura en una **base vacía de pruebas**. Usa las variables `PGHOST`, `PGPORT`, `PGUSER`, `PGSSLMODE=verify-full` y `PGSSLROOTCERT` (ruta al archivo de CA) según el servidor. Proporciona la contraseña mediante el archivo protegido indicado en `PGPASSFILE`. Respalda también los objetos privados y verifica que los comprobantes restaurados sigan accesibles desde la API.

   ```sh
   pg_dump --format=custom --no-owner --no-privileges --file=montepica-predeploy.dump --dbname=montepica_staging
   pg_restore --exit-on-error --no-owner --no-privileges --dbname=montepica_restore montepica-predeploy.dump
   ```

8. Si falla el despliegue y el esquema admite la versión previa, vuelve al artefacto anterior y comprueba la disponibilidad y los flujos afectados. Para un esquema incompatible, detén escrituras, restaura el respaldo en una base nueva, valida los datos y conecta el artefacto anterior a esa base. Registra la hora del respaldo para identificar escrituras posteriores que deban recuperarse.

GitHub Actions ejecuta E2E con un PostgreSQL desechable y publica `backend-lcov` como artefacto. Con el análisis automático de SonarCloud, revisa la puerta en el SHA publicado. Para importar LCOV a SonarCloud habría que coordinar el paso a análisis desde CI y desactivar el automático en el proyecto.

### Evidencia de la etapa 12

- Con Node.js 24 pasaron compilación, lint, 49 pruebas unitarias y 48 E2E. La suite E2E usó PostgreSQL real y almacenamiento de comprobantes simulado.
- En un entorno local desechable se aplicaron las migraciones compiladas sobre PostgreSQL 17 con TLS verificado. La API respondió en readiness, mantuvo Swagger deshabilitado en producción, envió el código a un servidor SMTP de pruebas por TLS y revocó la sesión previa al cambiar la contraseña.
- Se restauró un respaldo de esa base en otra base vacía y se comprobó la versión de acceso del usuario recuperado.
- SonarCloud aprobó el commit publicado `2a3d7bbf128ebe89e0a0585e712a57a4235705cd` con 2,8 % de duplicación. El análisis de los cambios de esta etapa se obtiene al publicarlos.
