import { AdvancedConsoleLogger, type QueryRunner } from 'typeorm';

// DB_LOGGING may be enabled locally. Parameter values can contain session/QR hashes.
export class ParameterlessQueryLogger extends AdvancedConsoleLogger {
  override logQuery(query: string, _parameters?: unknown[], runner?: QueryRunner): void {
    super.logQuery(query, undefined, runner);
  }

  override logQueryError(_error: string, query: string, _parameters?: unknown[], runner?: QueryRunner): void {
    // PostgreSQL errors may themselves carry parameter values in their detail field.
    super.logQueryError('Consulta PostgreSQL fallida.', query, undefined, runner);
  }

  override logQuerySlow(time: number, query: string, _parameters?: unknown[], runner?: QueryRunner): void {
    super.logQuerySlow(time, query, undefined, runner);
  }
}
