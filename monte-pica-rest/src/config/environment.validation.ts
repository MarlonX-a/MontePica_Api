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
}

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
  const raw = value === undefined || value === '' ? String(defaultValue) : String(value);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`La variable ${name} debe ser un número entero.`);
  }

  const parsed = Number(raw);
  if (parsed < min || parsed > max) {
    throw new Error(`La variable ${name} debe estar entre ${min} y ${max}.`);
  }
  return parsed;
}

function booleanValue(value: unknown, name: string, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`La variable ${name} debe ser true o false.`);
}

function originsValue(value: unknown): string[] {
  if (value === undefined || value === '') return [];
  if (typeof value !== 'string') {
    throw new Error('La variable CORS_ORIGINS debe ser una lista separada por comas.');
  }

  const origins = [...new Set(value.split(',').map((origin) => origin.trim()).filter(Boolean))];
  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`El origen CORS "${origin}" no es una URL válida.`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error(`El origen CORS "${origin}" debe ser un origen HTTP o HTTPS sin ruta.`);
    }
  }
  return origins;
}

export function validateEnvironment(
  raw: Record<string, unknown>,
): ValidatedEnvironment {
  const nodeEnv = requiredString(raw.NODE_ENV, 'NODE_ENV', 'development');
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('La variable NODE_ENV debe ser development, test o production.');
  }

  const databaseUsername = requiredString(raw.DB_USERNAME, 'DB_USERNAME');
  const databaseName = requiredString(raw.DB_NAME, 'DB_NAME');
  const databasePassword = requiredString(raw.DB_PASSWORD, 'DB_PASSWORD');
  if (databasePassword === 'cambia_esta_clave_local') {
    throw new Error('Reemplaza DB_PASSWORD con la contraseña configurada en PostgreSQL.');
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
    CORS_ORIGINS: originsValue(raw.CORS_ORIGINS),
  };
}
