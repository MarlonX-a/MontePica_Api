export interface GetSettingsFindConfiguracionOperativaRow {
  id: number;
  timeZone: string;
  openingTime: string;
  closingTime: string;
  localOrderEditSeconds: number;
  updatedAt: Date;
}

export interface UpdateSettingsUpdateConfiguracionOperativaRow {
  id: number;
  timeZone: string;
  openingTime: string;
  closingTime: string;
  localOrderEditSeconds: number;
  updatedAt: Date;
}

export interface GetCurrentFindOperationRow {
  businessDate: string;
}

export interface GetCurrentFindJornadaOperativaRow {
  id: string;
  businessDate: string;
  status: string;
  openedAt: Date;
  openedBy: string;
}

export interface GetCurrentFindCajaRow {
  id: string;
  status: string;
  openingAmountCents: number;
  openedAt: Date;
  openedBy: string;
  closureId: string;
  closedAt: Date;
  closedBy: string;
  closureOpeningCents: number;
  closureCashIncomeCents: number;
  closureCashRefundsCents: number;
  expectedCents: number;
  countedCents: number;
  differenceCents: number;
  closureReason: string;
}

export interface GetCashSummaryFindPagoRow {
  cashRegisterId: string;
  status: string;
  opening: string;
  income: string;
  refunds: string;
  transfers: string;
  closureId: string;
  closedAt: Date;
  closedBy: string;
  counted: string;
  difference: string;
  reason: string;
}

export interface ListCashRegistersFindCajaRow {
  total: number;
}

export interface ListCashRegistersFindCajaNextRow {
  id: string;
  operatingDayId: string;
  status: string;
  openingCents: number;
  openedAt: Date;
  openedBy: string;
  closureId: string;
  closedAt: Date;
  closedBy: string;
  expectedCents: number;
  countedCents: number;
  differenceCents: number;
}

export interface GetCashClosureFindCierreCajaRow {
  id: string;
  cashRegisterId: string;
  closedBy: string;
  closedAt: Date;
  openingCents: number;
  cashIncomeCents: number;
  cashRefundsCents: number;
  expectedCents: number;
  countedCents: number;
  differenceCents: number;
  reason: string;
  currency: string;
}

export interface GetCashClosureFindCajaRow {
  '1': string;
}

export interface GetCashClosingPreviewFindCajaRow {
  id: string;
  day: string;
  status: string;
  opening: string;
}

export interface CloseCashFindCajaRow {
  day: string;
}

export interface CloseCashFindCajaNextRow {
  day: string;
  status: string;
  opening: string;
}

export interface CloseCashInsertCierreCajaRow {
  id: string;
  closedAt: Date;
}

export interface AuthorizeCashClosureFindRolPermisoRow {
  activo: boolean;
  role: string;
  revocada_en: Date | null;
  valid: boolean;
  allowed: boolean;
}

export interface CashSnapshotFindPagoRow {
  income: string;
  refunds: string;
  transfers: string;
}

export interface ClosingBlockersFindOperationRow {
  total: number;
}

export interface ClosingBlockersLockOperationRow {
  id: string;
}

export interface PendingCashDayRefundsFindDevolucionRow {
  total: number;
  amountCents: string;
}

export interface GetCashClosureWithFindCierreCajaRow {
  id: string;
  cashRegisterId: string;
  closedBy: string;
  closedAt: Date;
  openingCents: number;
  cashIncomeCents: number;
  cashRefundsCents: number;
  expectedCents: number;
  countedCents: number;
  differenceCents: number;
  reason: string;
  currency: string;
}

export interface OpenDayInsertJornadaOperativaRow {
  id: string;
  businessDate: string;
  status: string;
  openedAt: Date;
  openedBy: string;
}

export interface OpenCashFindJornadaOperativaRow {
  id: string;
}

export interface OpenCashInsertCajaRow {
  id: string;
  status: string;
  openingAmountCents: number;
  openedAt: Date;
  openedBy: string;
}

export interface GetSettingsWithFindConfiguracionOperativaRow {
  id: number;
  timeZone: string;
  openingTime: string;
  closingTime: string;
  localOrderEditSeconds: number;
  updatedAt: Date;
}
