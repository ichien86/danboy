import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute<{ tahun: string }>(async ({ user, params }) => svc.ambilJadwal(user, Number(params.tahun)));
export const PUT = rute<{ tahun: string }>(async ({ req, user, params }) => svc.simpanJadwal(user, Number(params.tahun), await bodyJson(req, S.jadwalInput)));
