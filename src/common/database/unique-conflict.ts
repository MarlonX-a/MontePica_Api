import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

export function throwConflictIfUnique(error: unknown, message: string): void {
  if (
    error instanceof QueryFailedError &&
    (error as QueryFailedError & { driverError?: { code?: string } })
      .driverError?.code === '23505'
  ) {
    throw new ConflictException(message);
  }
}
