import { z } from 'zod';
import { STORAGE_LIMIT, type Account } from './documents';

const unavailableAccount = z.object({
  code: z.literal('ACCOUNT_STORAGE_UNAVAILABLE'),
  account: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().min(1).max(100),
    usedBytes: z.null(),
    limitBytes: z.literal(STORAGE_LIMIT),
  }),
});

export function accountDuringStorageFailure(
  path: string,
  status: number,
  body: unknown,
): Account | null {
  if (status < 500 || !['/auth/login', '/auth/register', '/me'].includes(path)) return null;
  const parsed = unavailableAccount.safeParse(body);
  return parsed.success ? parsed.data.account : null;
}
