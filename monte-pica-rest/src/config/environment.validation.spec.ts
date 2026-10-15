import { validateEnvironment } from './environment.validation.js';

describe('validateEnvironment', () => {
  const required = {
    DB_USERNAME: 'monte_pica_app',
    DB_PASSWORD: 'local_secret',
    DB_NAME: 'monte_pica',
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
    });
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
});
