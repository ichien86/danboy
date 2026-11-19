import type { NextAuthConfig } from 'next-auth';
import type { Peran } from '@danboy/core';

declare module 'next-auth' {
  interface User {
    id?: string;
    username?: string;
    nama?: string;
    peran?: Peran | null;
    aksesHibah?: string | null;
    skpdId?: string | null;
    wajibGantiSandi?: boolean;
  }
  interface Session {
    user: {
      id: string;
      username: string;
      nama: string;
      peran: Peran | null;
      skpdId: string | null;
      wajibGantiSandi: boolean;
      name?: string | null;
      email?: string | null;
    };
  }
}

/** Konfigurasi yang aman untuk edge (middleware): tanpa akses basis data. */
export const authConfig = {
  pages: { signIn: '/login' },
  // sesi JWT terenkripsi di cookie httpOnly, bergulir 2 jam
  session: { strategy: 'jwt', maxAge: 2 * 60 * 60, updateAge: 5 * 60 },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.nama = user.nama;
        token.peran = user.peran ?? null;
        token.skpdId = user.skpdId ?? null;
        token.wajibGantiSandi = !!user.wajibGantiSandi;
      }
      if (trigger === 'update' && session && (session as { wajibGantiSandi?: boolean }).wajibGantiSandi === false) {
        token.wajibGantiSandi = false;
      }
      return token;
    },
    session({ session, token }) {
      session.user = {
        ...session.user,
        id: token.id as string,
        username: token.username as string,
        nama: token.nama as string,
        peran: (token.peran as Peran | null) ?? null,
        skpdId: (token.skpdId as string | null) ?? null,
        wajibGantiSandi: !!token.wajibGantiSandi,
      };
      return session;
    },
  },
} satisfies NextAuthConfig;
