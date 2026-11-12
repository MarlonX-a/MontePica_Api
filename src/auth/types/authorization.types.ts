export interface StaffSessionState {
  activo: boolean;
  role: string;
  revocada_en: Date | null;
  valid: boolean;
  allowed: boolean;
}
