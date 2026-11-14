import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { login } from '@danboy/schema';
import { verifikasiLogin } from '@danboy/core/services';
import { authConfig } from './auth.config';

class LoginGagal extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { username: {}, password: {} },
      async authorize(cred, req) {
        const v = login.safeParse(cred);
        if (!v.success) throw new LoginGagal('salah');
        const ip = req?.headers?.get?.('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
        const r = await verifikasiLogin(v.data.username, v.data.password, ip);
        if (!r.ok || !r.user) {
          const menit = r.terkunciSampai ? Math.max(1, Math.ceil((+new Date(r.terkunciSampai) - Date.now()) / 60000)) : 0;
          throw new LoginGagal(r.alasan === 'terkunci' ? `terkunci:${menit}` : (r.alasan ?? 'salah'));
        }
        return { ...r.user, name: r.user.nama };
      },
    }),
  ],
});
