export interface AuthUserResponse {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: { code: string; name: string };
  clientId: string | null;
  permissions: string[];
}

export interface AuthenticatedRequestContext {
  userId: string;
  sessionId: string;
}
