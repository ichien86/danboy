import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const POST = rute<{ tahun: string }>(async ({ req, user, params }) => svc.beriPerpanjangan(user, Number(params.tahun), await bodyJson(req, S.perpanjanganInput)));
export const DELETE = rute<{ tahun: string }>(async ({ user, params, query }) =>
  svc.cabutPerpanjangan(user, Number(params.tahun), S.tahapanHibah.parse(query.tahapan), query.skpdId ?? ''),
);
