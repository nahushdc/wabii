import * as Crypto from 'expo-crypto';

export const PIN_LENGTH = 4;

function randomSalt(): string {
  return Crypto.randomUUID();
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function createPinHash(pin: string): Promise<{ hash: string; salt: string }> {
  const salt = randomSalt();
  const hash = await hashPin(pin, salt);
  return { hash, salt };
}

export async function verifyPin(pin: string, hash: string, salt: string): Promise<boolean> {
  const attempt = await hashPin(pin, salt);
  return attempt === hash;
}
