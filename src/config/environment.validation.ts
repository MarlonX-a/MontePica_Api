export interface ValidatedEnvironment {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DB_HOST: string;
  DB_PORT: number;
  DB_USERNAME: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  DB_LOGGING: boolean;
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

export type ValidatedDatabaseEnvironment = Omit<
  ValidatedEnvironment,
  | 'CORS_ORIGINS'
  | 'JWT_ACCESS_SECRET'
  | 'TRANSFER_PAYMENTS_ENABLED'
  | 'S3_REGION'
  | 'S3_BUCKET'
  | 'S3_ACCESS_KEY_ID'
  | 'S3_SECRET_ACCESS_KEY'
  | 'S3_ENDPOINT'
  | 'S3_PREFIX'
  | 'S3_FORCE_PATH_STYLE'
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
  if (value !== undefined && typeof value !== 'string' && typeof value !== 'number') {
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
  };
}

export function validateEnvironment(
  raw: Record<string, unknown>,
): ValidatedEnvironment {
  const database = validateDatabaseEnvironment(raw);
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
      url.password
    )
      throw new Error(
        'S3_ENDPOINT debe ser una URL HTTP o HTTPS sin credenciales.',
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
    CORS_ORIGINS: originsValue(raw.CORS_ORIGINS),
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
