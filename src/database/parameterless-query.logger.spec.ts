import { ParameterlessQueryLogger } from './parameterless-query.logger.js';

it('omits sensitive query parameters and database error details from all query logs', () => {
  class RecordingLogger extends ParameterlessQueryLogger {
    entries: unknown[] = [];
    protected override writeLog(_level: unknown, messages: unknown): void { this.entries.push(messages); }
  }
  const logger = new RecordingLogger(true);
  const secret = 'guest_sensitive_parameter';
  logger.logQuery('SELECT $1', [secret]);
  logger.logQueryError(`duplicate value ${secret}`, 'SELECT $1', [secret]);
  logger.logQuerySlow(3000, 'SELECT $1', [secret]);
  expect(logger.entries).toHaveLength(3);
  expect(JSON.stringify(logger.entries)).not.toContain(secret);
});
