import { validateEnvironment } from './environment.validation.js';

describe('validateEnvironment', () => {
  const required = {
    DB_USERNAME: 'monte_pica_app',
    DB_PASSWORD: 'local_secret',
    DB_NAME: 'monte_pica',
    JWT_ACCESS_SECRET: 'test-only-secret-with-at-least-32-bytes',
  };

  it('applies safe local defaults and parses CORS origins', () => {
    expect(
      validateEnvironment({
        ...required,
        CORS_ORIGINS: 'http://localhost:8081, http://localhost:8081',
      }),
    ).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DB_HOST: '127.0.0.1',
      DB_PORT: 5432,
      ...required,
      DB_LOGGING: false,
      CORS_ORIGINS: ['http://localhost:8081'],
      JWT_ACCESS_SECRET: required.JWT_ACCESS_SECRET,
      TRANSFER_PAYMENTS_ENABLED: false,
      S3_REGION: '', S3_BUCKET: '', S3_ACCESS_KEY_ID: '', S3_SECRET_ACCESS_KEY: '',
      S3_ENDPOINT: '', S3_PREFIX: 'montepica/receipts/', S3_FORCE_PATH_STYLE: false,
    });
  });

  it('requires S3 credentials when transfers are enabled', () => {
    expect(() => validateEnvironment({ ...required, TRANSFER_PAYMENTS_ENABLED: 'true' })).toThrow('S3_REGION');
    expect(() => validateEnvironment({ ...required, S3_PREFIX: '../unsafe/' })).toThrow('S3_PREFIX');
  });

  it('rejects missing credentials and invalid ports', () => {
    expect(() => validateEnvironment({})).toThrow('DB_USERNAME');
    expect(() => validateEnvironment({ ...required, PORT: '70000' })).toThrow('PORT');
    expect(() =>
      validateEnvironment({ ...required, DB_PASSWORD: 'cambia_esta_clave_local' }),
    ).toThrow('Reemplaza DB_PASSWORD');
  });

  it('rejects CORS entries that are not bare HTTP origins', () => {
    expect(() =>
      validateEnvironment({ ...required, CORS_ORIGINS: 'http://localhost:8081/app' }),
    ).toThrow('sin ruta');
  });

  it('requires a sufficiently long access-token secret for the application', () => {
    expect(() => validateEnvironment({ ...required, JWT_ACCESS_SECRET: 'short' })).toThrow(
      'JWT_ACCESS_SECRET debe tener al menos 32 bytes',
    );
  });
});
