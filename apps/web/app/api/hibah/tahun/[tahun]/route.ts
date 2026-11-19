import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const PATCH = rute<{ tahun: string }>(async ({ req, user, params }) => svc.ubahTahunHibah(user, Number(params.tahun), await bodyJson(req, S.tahunHibahUbah)));
