export const pageArgs = (query: { page: number; limit: number }) => ({
  page: query.page ?? 1,
  limit: query.limit ?? 20,
});

export interface ListOperatingDaysFindJornadaOperativaRow {
  total: number;
}

export interface ListOperatingDaysFindJornadaOperativaNextRow {
  id: string;
  businessDate: string;
  status: string;
  openedAt: Date;
  openedBy: string;
  closedAt: Date | null;
  closedBy: string | null;
  closureId: string | null;
}

export interface ListInventoryFindProductoRow {
  total: number;
}

export interface ListInventoryFindProductoNextRow {
  inventoryId: string;
  product: { id: string; sku: string; name: string; categoryId: string };
  initialized: boolean;
  initialQuantity: number;
  physicalQuantity: number;
  reservedQuantity: number;
  availableQuantity: string;
}

export interface GetInventoryItemFindProductoRow {
  inventoryId: string;
  product: { id: string; sku: string; name: string; categoryId: string };
  initialized: boolean;
  initialQuantity: number;
  physicalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
}

export interface ListMovementsFindMovimientoInventarioRow {
  total: number;
}

export interface ListMovementsFindMovimientoInventarioNextRow {
  id: string;
  type: string;
  physicalDelta: number;
  previousQuantity: number;
  resultingQuantity: number;
  reason: string;
  occurredAt: Date;
  recordedBy: string;
  productId: string;
  productName: string;
}

export interface InitializeFindProductoRow {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
}

export interface InitializeFindInventarioDiarioRow {
  '1': string;
}

export interface InitializeInsertInventarioDiarioRow {
  inventoryId: string;
  initialQuantity: number;
  physicalQuantity: number;
  reservedQuantity: number;
}

export interface InitializeInsertMovimientoInventarioRow {
  id: string;
  type: string;
  physicalDelta: number;
  previousQuantity: number;
  resultingQuantity: number;
  reason: string;
  occurredAt: Date;
}

export interface AssertOperatingDayExistsFindJornadaOperativaRow {
  '1': string;
}

export interface LockCurrentOperatingDayFindConfiguracionOperativaRow {
  timeZone: string;
}

export interface LockCurrentOperatingDayFindOperationNextRow {
  businessDate: string;
}

export interface LockCurrentOperatingDayFindJornadaOperativaRow {
  id: string;
  businessDate: string;
  status: string;
}

export interface LockInventoryFindInventarioDiarioRow {
  id: string;
  initialQuantity: number;
  physicalQuantity: number;
  reservedQuantity: number;
  productId: string;
  sku: string;
  productName: string;
}

export interface WriteMovementInsertMovimientoInventarioRow {
  id: string;
  type: string;
  physicalDelta: number;
  previousQuantity: number;
  resultingQuantity: number;
  reason: string;
  occurredAt: Date;
}

export interface IdempotentFindIdempotenciaRow {
  requestHash: string;
  response: unknown;
}
