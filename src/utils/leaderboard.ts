const getEnv = () => (window as any).ENV || {};

export interface LeaderboardRow {
  nickname: string | null;
  score: number;
  created_at: string;
}

export async function fetchSupabaseLeaderboard(
  page: number,
  pageSize: number
): Promise<{ rows: LeaderboardRow[]; hasNext: boolean }> {
  const ENV = getEnv();
  const url = ENV.SUPABASE_URL as string | undefined;
  const key = ENV.SUPABASE_ANON_KEY as string | undefined;

  if (!url || !key) {
    return { rows: [], hasNext: false };
  }

  const offset = (page - 1) * pageSize;
  const limit = pageSize + 1;
  const headers = { apikey: key, Authorization: 'Bearer ' + key };
  const endpoint =
    url +
    '/rest/v1/scores?select=nickname,score,created_at&order=score.desc&limit=' +
    limit +
    '&offset=' +
    offset;

  const rows: LeaderboardRow[] = await fetch(endpoint, {
    headers,
  }).then((r) => r.json());

  const hasNext = rows.length > pageSize;
  const slice = hasNext ? rows.slice(0, pageSize) : rows;

  return { rows: slice, hasNext };
}

export async function submitSupabaseScore(
  nickname: string,
  score: number
): Promise<boolean> {
  const ENV = getEnv();
  const url = ENV.SUPABASE_URL as string | undefined;
  const key = ENV.SUPABASE_ANON_KEY as string | undefined;

  if (!url || !key) {
    return false;
  }

  const endpoint = url + '/rest/v1/scores';
  const headers = {
    apikey: key,
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const body = JSON.stringify({
    nickname,
    score,
  });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body,
  });

  return res.ok;
}

