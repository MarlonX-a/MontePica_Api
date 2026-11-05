import { ConfigService } from '@nestjs/config';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { validateEnvironment } from '../config/environment.validation.js';
import { ReceiptStorageService } from '../tables/receipt-storage.service.js';
import { ReceiptReferenceRepository } from '../tables/repositories/receipt-reference.repository.js';
import { createDatabaseOptions } from './database.options.js';

async function main() {
  const env = validateEnvironment(process.env);
  if (!env.TRANSFER_PAYMENTS_ENABLED)
    throw new Error('Las transferencias deben estar habilitadas.');
  const storage = new ReceiptStorageService(new ConfigService(env));
  const db = new DataSource(createDatabaseOptions(process.env));
  await db.initialize();
  try {
    const candidates = await storage.listOld(
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    );
    let removed = 0;
    for (const candidate of candidates) {
      const referenced = await new ReceiptReferenceRepository().isReferenced(
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
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `No se pudo conciliar comprobantes: ${error instanceof Error ? error.message : 'error desconocido'}\n`,
  );
  process.exitCode = 1;
});
