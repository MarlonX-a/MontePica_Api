import { ConsumptionAccount } from '../accounts/entities/consumption-account.entity.js';
import { ConsumptionAssignment } from '../accounts/entities/consumption-assignment.entity.js';
import { UserSession } from '../auth/entities/user-session.entity.js';
import { CancellationHistory } from '../cancellations/entities/cancellation-history.entity.js';
import { CancellationRequest } from '../cancellations/entities/cancellation-request.entity.js';
import { CashClosure } from '../cash/entities/cash-closure.entity.js';
import { CashRefundOutflow } from '../cash/entities/cash-refund-outflow.entity.js';
import { CashRegister } from '../cash/entities/cash-register.entity.js';
import { Category } from '../catalog/entities/category.entity.js';
import { Product } from '../catalog/entities/product.entity.js';
import { AuditEntry } from '../common/audit/entities/audit-entry.entity.js';
import { IdempotencyRecord } from '../common/idempotency/entities/idempotency-record.entity.js';
import { Client } from '../common/identity/entities/client.entity.js';
import { DeliveryDetails } from '../delivery/entities/delivery-details.entity.js';
import { DeliveryRequest } from '../delivery/entities/delivery-request.entity.js';
import { DeliverySettings } from '../delivery/entities/delivery-settings.entity.js';
import { GuestSession } from '../guest-sessions/entities/guest-session.entity.js';
import { DailyInventory } from '../inventory/entities/daily-inventory.entity.js';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity.js';
import { ExceptionalDayOpening } from '../operations/entities/exceptional-day-opening.entity.js';
import { OperatingDayClosure } from '../operations/entities/operating-day-closure.entity.js';
import { OperatingDay } from '../operations/entities/operating-day.entity.js';
import { OperationsSettings } from '../operations/entities/operations-settings.entity.js';
import { InventoryReservation } from '../orders/entities/inventory-reservation.entity.js';
import { OrderHistory } from '../orders/entities/order-history.entity.js';
import { OrderItem } from '../orders/entities/order-item.entity.js';
import { OrderVersion } from '../orders/entities/order-version.entity.js';
import { Order } from '../orders/entities/order.entity.js';
import { Participant } from '../participants/entities/participant.entity.js';
import { PaymentHistory } from '../payments/entities/payment-history.entity.js';
import { Payment } from '../payments/entities/payment.entity.js';
import { PointsAccrual } from '../points/entities/points-accrual.entity.js';
import { PointsMovement } from '../points/entities/points-movement.entity.js';
import { PointsSettings } from '../points/entities/points-settings.entity.js';
import { RedemptionHistory } from '../redemptions/entities/redemption-history.entity.js';
import { RedemptionInventoryReservation } from '../redemptions/entities/redemption-inventory-reservation.entity.js';
import { RedemptionPointsReservation } from '../redemptions/entities/redemption-points-reservation.entity.js';
import { RedemptionRequest } from '../redemptions/entities/redemption-request.entity.js';
import { RefundHistory } from '../refunds/entities/refund-history.entity.js';
import { Refund } from '../refunds/entities/refund.entity.js';
import { Reward } from '../rewards/entities/reward.entity.js';
import { Permission } from '../roles/entities/permission.entity.js';
import { RolePermission } from '../roles/entities/role-permission.entity.js';
import { Role } from '../roles/entities/role.entity.js';
import { SettlementItem } from '../settlements/entities/settlement-item.entity.js';
import { Settlement } from '../settlements/entities/settlement.entity.js';
import { RestaurantTable } from '../tables/entities/restaurant-table.entity.js';
import { Receipt } from '../transfers/entities/receipt.entity.js';
import { Profile } from '../users/entities/profile.entity.js';
import { User } from '../users/entities/user.entity.js';
import { TableVisit } from '../visits/entities/table-visit.entity.js';

export const databaseEntities = [
  Category,
  Product,
  Role,
  User,
  Profile,
  Client,
  UserSession,
  Permission,
  RolePermission,
  OperatingDay,
  CashRegister,
  DailyInventory,
  GuestSession,
  RestaurantTable,
  TableVisit,
  Participant,
  AuditEntry,
  IdempotencyRecord,
  OrderVersion,
  OrderItem,
  ConsumptionAssignment,
  InventoryReservation,
  OrderHistory,
  OperationsSettings,
  InventoryMovement,
  SettlementItem,
  Payment,
  Receipt,
  PaymentHistory,
  DeliverySettings,
  DeliveryRequest,
  ConsumptionAccount,
  DeliveryDetails,
  Settlement,
  CancellationRequest,
  CancellationHistory,
  Refund,
  RefundHistory,
  CashRefundOutflow,
  PointsSettings,
  PointsAccrual,
  Reward,
  RedemptionRequest,
  RedemptionPointsReservation,
  RedemptionInventoryReservation,
  RedemptionHistory,
  Order,
  PointsMovement,
  CashClosure,
  OperatingDayClosure,
  ExceptionalDayOpening,
];
