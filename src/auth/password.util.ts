import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

const SCRYPT_N = 131072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 256 * 1024 * 1024;
const DUMMY_SALT = Buffer.alloc(16, 73);
const DUMMY_HASH = Buffer.alloc(SCRYPT_KEY_LENGTH);

export function normalizeEmail(email: string): string {
  return email.trim().normalize('NFC').toLowerCase();
}

export function normalizePhone(phone: string): string {
  const compact = phone.trim().replace(/[\s()-]/g, '');
  if (/^\+593\d{9}$/.test(compact)) return compact;
  if (/^\d{10}$/.test(compact)) return `+593${compact.slice(-9)}`;
  throw new BadRequestException('El teléfono debe tener 10 dígitos o el código +593 con 9 dígitos.');
}

async function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, SCRYPT_KEY_LENGTH, {
      N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAX_MEMORY,
    }, (error, derived) => error ? reject(error) : resolve(derived));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, encodedHash?: string): Promise<boolean> {
  let salt = DUMMY_SALT;
  let expected = DUMMY_HASH;
  if (encodedHash) {
    const [algorithm, n, r, p, saltText, hashText, extra] = encodedHash.split('$');
    if (algorithm === 'scrypt' && n === String(SCRYPT_N) && r === String(SCRYPT_R) &&
        p === String(SCRYPT_P) && saltText && hashText && !extra) {
      const parsedSalt = Buffer.from(saltText, 'base64url');
      const parsedHash = Buffer.from(hashText, 'base64url');
      if (parsedSalt.length === 16 && parsedHash.length === SCRYPT_KEY_LENGTH) {
        salt = parsedSalt;
        expected = parsedHash;
      }
    }
  }
  const actual = await derivePassword(password, salt);
  const matches = timingSafeEqual(actual, expected);
  return matches && expected !== DUMMY_HASH;
}
