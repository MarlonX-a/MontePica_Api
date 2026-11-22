import { isIP } from 'node:net';

export interface ValidatedEnvironment {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DB_HOST: string;
  DB_PORT: number;
  DB_USERNAME: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  DB_LOGGING: boolean;
  DB_TLS: boolean;
  DB_TLS_CA: string;
  SWAGGER_ENABLED: boolean;
  TRUST_PROXY: string[];
  PASSWORD_RECOVERY_ENABLED: boolean;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER: string;
  SMTP_PASSWORD: string;
  SMTP_FROM: string;
  CORS_ORIGINS: string[];
  JWT_ACCESS_SECRET: string;
  TRANSFER_PAYMENTS_ENABLED: boolean;
  S3_REGION: string;
  S3_BUCKET: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  S3_ENDPOINT: string;
  S3_PREFIX: string;
  S3_FORCE_PATH_STYLE: boolean;
}

export type ValidatedDatabaseEnvironment = Pick<
  ValidatedEnvironment,
  | 'NODE_ENV'
  | 'PORT'
  | 'DB_HOST'
  | 'DB_PORT'
  | 'DB_USERNAME'
  | 'DB_PASSWORD'
  | 'DB_NAME'
  | 'DB_LOGGING'
  | 'DB_TLS'
  | 'DB_TLS_CA'
>;

function requiredString(
  value: unknown,
  name: string,
  defaultValue?: string,
): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized) return normalized;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`La variable ${name} es obligatoria.`);
}

function integerValue(
  value: unknown,
  name: string,
  defaultValue: number,
  min: number,
  max: number,
): number {
  if (
    value !== undefined &&
    typeof value !== 'string' &&
    typeof value !== 'number'
  ) {
    throw new TypeError(`La variable ${name} debe ser un número entero.`);
  }
  const raw =
    value === undefined || value === '' ? String(defaultValue) : String(value);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`La variable ${name} debe ser un número entero.`);
  }

  const parsed = Number(raw);
  if (parsed < min || parsed > max) {
    throw new Error(`La variable ${name} debe estar entre ${min} y ${max}.`);
  }
  return parsed;
}

function booleanValue(
  value: unknown,
  name: string,
  defaultValue: boolean,
): boolean {
  if (value === undefined || value === '') return defaultValue;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`La variable ${name} debe ser true o false.`);
}

function originsValue(value: unknown): string[] {
  if (value === undefined || value === '') return [];
  if (typeof value !== 'string') {
    throw new TypeError(
      'La variable CORS_ORIGINS debe ser una lista separada por comas.',
    );
  }

  const origins = [
    ...new Set(
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  ];
  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`El origen CORS "${origin}" no es una URL válida.`);
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.origin !== origin
    ) {
      throw new Error(
        `El origen CORS "${origin}" debe ser un origen HTTP o HTTPS sin ruta.`,
      );
    }
  }
  return origins;
}

export function validateDatabaseEnvironment(
  raw: Record<string, unknown>,
): ValidatedDatabaseEnvironment {
  const nodeEnv = requiredString(raw.NODE_ENV, 'NODE_ENV', 'development');
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error(
      'La variable NODE_ENV debe ser development, test o production.',
    );
  }

  const databaseUsername = requiredString(raw.DB_USERNAME, 'DB_USERNAME');
  const databaseName = requiredString(raw.DB_NAME, 'DB_NAME');
  const databasePassword = requiredString(raw.DB_PASSWORD, 'DB_PASSWORD');
  const dbTls = booleanValue(raw.DB_TLS, 'DB_TLS', nodeEnv === 'production');
  if (nodeEnv === 'production' && !dbTls)
    throw new Error('DB_TLS debe estar habilitado en producción.');
  if (databasePassword === 'cambia_esta_clave_local') {
    throw new Error(
      'Reemplaza DB_PASSWORD con la contraseña configurada en PostgreSQL.',
    );
  }

  return {
    NODE_ENV: nodeEnv as ValidatedEnvironment['NODE_ENV'],
    PORT: integerValue(raw.PORT, 'PORT', 3000, 1, 65535),
    DB_HOST: requiredString(raw.DB_HOST, 'DB_HOST', '127.0.0.1'),
    DB_PORT: integerValue(raw.DB_PORT, 'DB_PORT', 5432, 1, 65535),
    DB_USERNAME: databaseUsername,
    DB_PASSWORD: databasePassword,
    DB_NAME: databaseName,
    DB_LOGGING: booleanValue(raw.DB_LOGGING, 'DB_LOGGING', false),
    DB_TLS: dbTls,
    DB_TLS_CA: requiredString(raw.DB_TLS_CA, 'DB_TLS_CA', '').replaceAll(
      '\\n',
      '\n',
    ),
  };
}

function proxyAddresses(value: unknown): string[] {
  const addresses = requiredString(value, 'TRUST_PROXY', '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const entry of addresses) {
    const [address, prefix, ...extra] = entry.split('/');
    const family = isIP(address);
    if (
      !family ||
      extra.length ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) ||
          Number(prefix) < 1 ||
          Number(prefix) > (family === 4 ? 32 : 128)))
    ) {
      throw new Error(
        'TRUST_PROXY debe contener IP o CIDR de proxies confiables.',
      );
    }
  }
  return addresses;
}

function recoveryEnvironment(
  raw: Record<string, unknown>,
  production: boolean,
) {
  const enabled = booleanValue(
    raw.PASSWORD_RECOVERY_ENABLED,
    'PASSWORD_RECOVERY_ENABLED',
    production,
  );
  const host = requiredString(
    raw.SMTP_HOST,
    'SMTP_HOST',
    enabled ? undefined : '',
  );
  const from = requiredString(
    raw.SMTP_FROM,
    'SMTP_FROM',
    enabled ? undefined : '',
  );
  const secure = booleanValue(raw.SMTP_SECURE, 'SMTP_SECURE', false);
  const user = requiredString(raw.SMTP_USER, 'SMTP_USER', '');
  const password =
    typeof raw.SMTP_PASSWORD === 'string' ? raw.SMTP_PASSWORD : '';
  if (enabled && !!user !== !!password)
    throw new Error('Configura SMTP_USER y SMTP_PASSWORD juntos.');
  if (enabled && !/^[^\s<>,@]+@[^\s<>,@]+\.[^\s<>,@]+$/.test(from))
    throw new Error('SMTP_FROM debe contener una sola dirección de correo.');
  return {
    PASSWORD_RECOVERY_ENABLED: enabled,
    SMTP_HOST: host,
    SMTP_PORT: integerValue(
      raw.SMTP_PORT,
      'SMTP_PORT',
      secure ? 465 : 587,
      1,
      65535,
    ),
    SMTP_SECURE: secure,
    SMTP_USER: user,
    SMTP_PASSWORD: password,
    SMTP_FROM: from,
  };
}

export function validateEnvironment(
  raw: Record<string, unknown>,
): ValidatedEnvironment {
  const database = validateDatabaseEnvironment(raw);
  const production = database.NODE_ENV === 'production';
  const origins = originsValue(raw.CORS_ORIGINS);
  if (production && origins.some((origin) => !origin.startsWith('https://')))
    throw new Error('CORS_ORIGINS solo admite orígenes HTTPS en producción.');
  const jwtAccessSecret = requiredString(
    raw.JWT_ACCESS_SECRET,
    'JWT_ACCESS_SECRET',
  );
  if (Buffer.byteLength(jwtAccessSecret, 'utf8') < 32) {
    throw new Error(
      'La variable JWT_ACCESS_SECRET debe tener al menos 32 bytes.',
    );
  }
  if (jwtAccessSecret === 'reemplaza_con_una_clave_aleatoria_de_32_bytes') {
    throw new Error(
      'Reemplaza JWT_ACCESS_SECRET con una clave aleatoria local.',
    );
  }

  const enabled = booleanValue(
    raw.TRANSFER_PAYMENTS_ENABLED,
    'TRANSFER_PAYMENTS_ENABLED',
    false,
  );
  const readS3 = (name: string) =>
    enabled
      ? requiredString(raw[name], name)
      : requiredString(raw[name], name, '');
  const endpoint = requiredString(raw.S3_ENDPOINT, 'S3_ENDPOINT', '');
  if (endpoint) {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new Error('S3_ENDPOINT debe ser una URL HTTP o HTTPS válida.');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      (production && url.protocol !== 'https:')
    )
      throw new Error(
        'S3_ENDPOINT debe ser una URL sin credenciales y usar HTTPS en producción.',
      );
  }
  const prefix = requiredString(
    raw.S3_PREFIX,
    'S3_PREFIX',
    'montepica/receipts/',
  );
  if (prefix.startsWith('/') || !prefix.endsWith('/') || prefix.includes('..'))
    throw new Error('S3_PREFIX debe ser un prefijo relativo terminado en /.');

  return {
    ...database,
    ...recoveryEnvironment(raw, production),
    CORS_ORIGINS: origins,
    SWAGGER_ENABLED: booleanValue(
      raw.SWAGGER_ENABLED,
      'SWAGGER_ENABLED',
      !production,
    ),
    TRUST_PROXY: proxyAddresses(raw.TRUST_PROXY),
    JWT_ACCESS_SECRET: jwtAccessSecret,
    TRANSFER_PAYMENTS_ENABLED: enabled,
    S3_REGION: readS3('S3_REGION'),
    S3_BUCKET: readS3('S3_BUCKET'),
    S3_ACCESS_KEY_ID: readS3('S3_ACCESS_KEY_ID'),
    S3_SECRET_ACCESS_KEY: readS3('S3_SECRET_ACCESS_KEY'),
    S3_ENDPOINT: endpoint,
    S3_PREFIX: prefix,
    S3_FORCE_PATH_STYLE: booleanValue(
      raw.S3_FORCE_PATH_STYLE,
      'S3_FORCE_PATH_STYLE',
      false,
    ),
  };
}
