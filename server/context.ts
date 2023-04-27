import { getServerSession } from 'next-auth';

import { getUserHash } from '@/utils/server/auth';

import { authOptions } from '@/pages/api/auth/[...nextauth]';

import { inferAsyncReturnType } from '@trpc/server';
import { CreateNextContextOptions } from '@trpc/server/adapters/next';

export async function createContext(opts: CreateNextContextOptions) {
  const session = await getServerSession(opts.req, opts.res, authOptions);
  let userHash: string | undefined;
  if (session) {
    userHash = await getUserHash(opts.req, opts.res);
  }
  return {
    req: opts.req,
    res: opts.res,
    session,
    userHash,
  };
}
export type Context = inferAsyncReturnType<typeof createContext>;
