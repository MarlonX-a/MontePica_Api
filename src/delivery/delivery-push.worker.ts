import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { DeliveryPushStore, type DeliveryPushJob } from '../database/delivery-push.store.js';
import { ExpoPushError, ExpoPushGateway } from './expo-push.gateway.js';

const maxAttempts = 8;
const transientExpoErrors = new Set(['MessageRateExceeded', 'ExpoServerError']);

@Injectable()
export class DeliveryPushWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  private stopping = false;
  private readonly logger = new Logger(DeliveryPushWorker.name);

  constructor(
    private readonly store: DeliveryPushStore,
    private readonly expo: ExpoPushGateway,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      if (this.active) return;
      this.active = this.runBatch().catch(() => {
        this.logger.error('No se pudo procesar la cola de avisos de domicilio.');
      }).finally(() => { this.active = undefined; });
    }, 5_000);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    await this.active;
  }

  private async runBatch(): Promise<void> {
    for (let index = 0; index < 20 && !this.stopping; index += 1) {
      const job = await this.store.claim();
      if (!job) return;
      await this.process(job);
    }
  }

  async process(job: DeliveryPushJob): Promise<void> {
    if (job.expired || job.attempts > maxAttempts) {
      await this.store.save(job, 'failed');
      return;
    }
    if (job.ticket) {
      await this.checkReceipt(job);
      return;
    }
    await this.send(job);
  }

  private async send(job: DeliveryPushJob): Promise<void> {
    const token = await this.store.token(job);
    if (!token) {
      await this.store.save(job, 'skipped');
      return;
    }
    let result;
    try {
      result = await this.expo.send(token, job.decision === 'approved');
    } catch (error) {
      await this.handleRequestError(job, error);
      return;
    }
    if (result.status === 'ok' && result.id) {
      await this.store.save(job, 'receipt', 900, result.id);
      return;
    }
    await this.handleRejection(job, result.details?.error);
  }

  private async checkReceipt(job: DeliveryPushJob): Promise<void> {
    let result;
    try {
      result = await this.expo.receipt(job.ticket!);
    } catch (error) {
      await this.handleRequestError(job, error);
      return;
    }
    if (!result) {
      await this.retry(job);
      return;
    }
    if (result.status === 'ok') {
      await this.store.save(job, 'accepted');
      return;
    }
    await this.handleRejection(job, result.details?.error);
  }

  private async handleRequestError(job: DeliveryPushJob, error: unknown): Promise<void> {
    if (error instanceof ExpoPushError && !error.retryable) {
      await this.store.save(job, 'failed');
      return;
    }
    await this.retry(job);
  }

  private async handleRejection(job: DeliveryPushJob, code?: string): Promise<void> {
    if (code === 'DeviceNotRegistered') await this.store.invalidate(job);
    if (code && transientExpoErrors.has(code)) {
      // A definitive rejection can be sent again. Missing receipts only get polled.
      await this.retry(job, true);
      return;
    }
    await this.store.save(job, 'failed');
  }

  private async retry(job: DeliveryPushJob, sendAgain = false): Promise<void> {
    if (job.attempts >= maxAttempts) {
      await this.store.save(job, 'failed');
      return;
    }
    const ticket = sendAgain ? null : job.ticket;
    const base = ticket ? 300 : 30;
    await this.store.save(job, ticket ? 'receipt' : 'pending', Math.min(3600, base * 2 ** (job.attempts - 1)), ticket);
  }
}
