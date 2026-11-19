import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const POST = rute(async ({ req, user }) => svc.cekDuplikatPenerima(user, await bodyJson(req, S.cekPenerimaInput)));
