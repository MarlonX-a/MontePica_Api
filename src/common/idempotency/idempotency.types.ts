export interface IdempotencyIdentity {
  actorType: 'usuario' | 'sesion_cliente';
  identity: string;
  operation: string;
  key: string;
}
