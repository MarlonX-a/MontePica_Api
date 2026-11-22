import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class PasswordRecoveryMailer {
  private readonly transport;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    this.from = config.get<string>('SMTP_FROM', '');
    if (!host) return;
    const secure = config.get<boolean>('SMTP_SECURE', false);
    const user = config.get<string>('SMTP_USER');
    this.transport = nodemailer.createTransport({
      host,
      port: config.get<number>('SMTP_PORT', 587),
      secure,
      requireTLS: !secure && config.get<string>('NODE_ENV') === 'production',
      auth: user
        ? { user, pass: config.getOrThrow<string>('SMTP_PASSWORD') }
        : undefined,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
    });
  }

  async send(email: string, token: string): Promise<void> {
    if (!this.transport) throw new Error('SMTP no configurado');
    const result = await this.transport.sendMail({
      from: this.from,
      to: { name: '', address: email },
      subject: 'Recuperación de contraseña de MontePica',
      text: `Tu código de recuperación es:\n\n${token}\n\nVence en 15 minutos y solo puede usarse una vez. Si no solicitaste este cambio, ignora el mensaje.`,
    });
    if (!result.accepted.length) throw new Error('SMTP no aceptó el mensaje');
  }
}
