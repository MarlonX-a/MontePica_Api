export interface LockedTable {
  id: string;
  code: string;
  active: boolean;
  qrVersion: number;
  qrHash: string | null;
}
