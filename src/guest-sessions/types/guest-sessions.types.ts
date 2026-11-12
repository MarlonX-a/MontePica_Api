export interface CreateInsertClienteRow {
  id: string;
  name: string;
  phone: string;
}

export interface CreateInsertSesionClienteRow {
  id: string;
  expiresAt: Date;
}

export interface AuthenticateFindSesionClienteRow {
  guestSessionId: string;
  clientId: string;
}

export interface RevokeUpdateSesionClienteRow {
  id_sesion_cliente: string;
}
