import { Injectable } from '@nestjs/common';

interface ExpoResult {
  status?: 'ok' | 'error';
  id?: string;
  details?: { error?: string };
}

export class ExpoPushError extends Error {
  constructor(readonly retryable: boolean) {
    super('Expo no pudo procesar el aviso de domicilio.');
  }
}

@Injectable()
export class ExpoPushGateway {
  async send(to: string, approved: boolean): Promise<ExpoResult> {
    const payload = await this.post<{ data?: ExpoResult | ExpoResult[] }>('send', {
      to,
      title: approved ? 'Cobertura aprobada' : 'Cobertura rechazada',
      body: 'Consulta el estado de tu solicitud en Pedidos.',
      channelId: 'delivery',
      ttl: 3600,
      data: { kind: 'deliveryCoverage' },
    });
    const result = Array.isArray(payload.data) ? payload.data[0] : payload.data;
    if (!result?.status || (result.status === 'ok' && !result.id)) {
      throw new ExpoPushError(true);
    }
    return result;
  }

  async receipt(ticket: string): Promise<ExpoResult | undefined> {
    const payload = await this.post<{ data?: Record<string, ExpoResult> }>('getReceipts', { ids: [ticket] });
    return payload.data?.[ticket];
  }

  private async post<T>(path: 'send' | 'getReceipts', body: object): Promise<T> {
    const configToken = process.env.EXPO_PUSH_ACCESS_TOKEN?.trim();
    const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(configToken ? { Authorization: `Bearer ${configToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new ExpoPushError(response.status === 408 || response.status === 429 || response.status >= 500);
    }
    return await response.json() as T;
  }
}
