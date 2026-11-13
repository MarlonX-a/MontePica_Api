import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ReceiptReconciliationService } from '../common/storage/receipt-reconciliation.service.js';
import { ReceiptStorageService } from '../common/storage/receipt-storage.service.js';
import { validateEnvironment } from '../config/environment.validation.js';
import { createCommandContext } from './command-context.js';

const env = validateEnvironment(process.env);
if (!env.TRANSFER_PAYMENTS_ENABLED)
  throw new Error('Las transferencias deben estar habilitadas.');
const context = await createCommandContext('receipts');
const storage = context.get(ReceiptStorageService);
const db = context.get(DataSource);
const reconciliation = context.get(ReceiptReconciliationService);
try {
  const candidates = await storage.listOld(
    new Date(Date.now() - 24 * 60 * 60 * 1000),
  );
  let removed = 0;
  for (const candidate of candidates) {
    const referenced = await reconciliation.isReferenced(
      db.manager,
      candidate.key,
    );
    if (!referenced) {
      await storage.delete(candidate.key);
      removed++;
    }
  }
  process.stdout.write(
    `Objetos revisados: ${candidates.length}; huérfanos eliminados: ${removed}.\n`,
  );
} catch (error: unknown) {
  process.stderr.write(
    `No se pudo conciliar comprobantes: ${error instanceof Error ? error.message : 'error desconocido'}\n`,
  );
  process.exitCode = 1;
} finally {
  await context.close();
}
