import { Global, Module } from '@nestjs/common';
import { AdminRepository } from '../admin/repositories/admin.repository.js';
import { AuthorizationRepository } from '../auth/repositories/authorization.repository.js';
import { IdentityRepository } from '../auth/repositories/identity.repository.js';
import { PermissionsRepository } from '../auth/repositories/permissions.repository.js';
import { AuditRepository } from './repositories/audit.repository.js';
import { BootstrapRepository } from './repositories/bootstrap.repository.js';
import { IdempotencyRepository } from './repositories/idempotency.repository.js';
import { OperationalLockRepository } from './repositories/operational-lock.repository.js';
import { InventoryRepository } from '../inventory/repositories/inventory.repository.js';
import { OperationsRepository } from '../operations/repositories/operations.repository.js';
import { OperatingDaysRepository } from '../operations/repositories/operating-days.repository.js';
import { PointsRepository } from '../points/repositories/points.repository.js';
import { RewardsRepository } from '../rewards/repositories/rewards.repository.js';
import { CancellationsRepository } from '../tables/repositories/cancellations.repository.js';
import { DeliveryExpiryResolutionRepository } from '../tables/repositories/delivery-expiry-resolution.repository.js';
import { DeliveryExpiryRepository } from '../tables/repositories/delivery-expiry.repository.js';
import { DeliveryRepository } from '../tables/repositories/delivery.repository.js';
import { GuestSessionsRepository } from '../tables/repositories/guest-sessions.repository.js';
import { OrdersRepository } from '../tables/repositories/orders.repository.js';
import { ParticipantsRepository } from '../tables/repositories/participants.repository.js';
import { PaymentsRepository } from '../tables/repositories/payments.repository.js';
import { ReceiptReferenceRepository } from '../tables/repositories/receipt-reference.repository.js';
import { RefundsRepository } from '../tables/repositories/refunds.repository.js';
import { SettlementsRepository } from '../tables/repositories/settlements.repository.js';
import { TableAccessRepository } from '../tables/repositories/table-access.repository.js';
import { TablesRepository } from '../tables/repositories/tables.repository.js';
import { TransfersRepository } from '../tables/repositories/transfers.repository.js';
const repositories = [
  AdminRepository,
  AuthorizationRepository,
  IdentityRepository,
  PermissionsRepository,
  AuditRepository,
  BootstrapRepository,
  IdempotencyRepository,
  OperationalLockRepository,
  InventoryRepository,
  OperationsRepository,
  OperatingDaysRepository,
  PointsRepository,
  RewardsRepository,
  CancellationsRepository,
  DeliveryExpiryResolutionRepository,
  DeliveryExpiryRepository,
  DeliveryRepository,
  GuestSessionsRepository,
  OrdersRepository,
  ParticipantsRepository,
  PaymentsRepository,
  ReceiptReferenceRepository,
  RefundsRepository,
  SettlementsRepository,
  TableAccessRepository,
  TablesRepository,
  TransfersRepository,
];
@Global()
@Module({ providers: repositories, exports: repositories })
export class PersistenceModule {}
