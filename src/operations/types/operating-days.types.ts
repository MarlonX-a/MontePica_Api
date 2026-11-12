export interface OperatingDayRow {
  id: string;
  businessDate: string;
  status: string;
  openedAt: Date;
  openedBy: string;
  closedAt: Date | null;
  closedBy: string | null;
  closureId: string | null;
  cashRegisterId: string | null;
  cashStatus: string | null;
  cashClosureId: string | null;
}

export interface OperatingDayClosureRow {
  id: string;
  operatingDayId: string;
  cashClosureId: string | null;
  closedBy: string;
  closedAt: Date;
  notes: string | null;
  summary: Record<string, number>;
}

export interface OperatingDayBlockerRow {
  kind: string;
  id: string;
  reason: string;
}

export interface OperatingDayCountsRow {
  openCash: number;
  cashWithoutClosure: number;
  unfinishedOrders: number;
  unsettledConsumption: number;
  pendingSettlements: number;
  pendingTransfers: number;
  pendingCancellations: number;
  activeOrderReservations: number;
}

export interface OperatingDayCleanupCountsRow {
  pendingRedemptions: number;
  pendingParticipants: number;
  approvedParticipants: number;
  openVisits: number;
  unusedDeliveryRequests: number;
}

export interface OpenOperatingDayRow {
  id: string;
  businessDate: string;
  status: string;
  openedAt: Date;
  openedBy: string;
}

export interface AuthorizedOperatingActionRow {
  activo: boolean;
  role: string;
  revocada_en: Date | null;
  valid: boolean;
  allowed: boolean;
}
