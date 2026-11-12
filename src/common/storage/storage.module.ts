import { Module } from '@nestjs/common';
import { ReceiptReconciliationService } from './receipt-reconciliation.service.js';
import { ReceiptStorageService } from './receipt-storage.service.js';

@Module({
  imports: [],
  controllers: [],
  providers: [ReceiptReconciliationService, ReceiptStorageService],
  exports: [ReceiptReconciliationService, ReceiptStorageService],
})
export class StorageModule {}
