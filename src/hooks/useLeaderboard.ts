import { useEffect, useState } from 'react';
import {
  fetchSupabaseLeaderboard,
  type LeaderboardRow,
} from '../utils/leaderboard';

interface UseLeaderboardResult {
  loading: boolean;
  rows: LeaderboardRow[];
  page: number;
  hasNext: boolean;
  error: string | null;
  nextPage: () => void;
  prevPage: () => void;
  reload: () => void;
}

const PAGE_SIZE = 10;

export function useLeaderboard(): UseLeaderboardResult {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (pageToLoad: number) => {
    setLoading(true);
    setError(null);
    try {
      const { rows, hasNext } = await fetchSupabaseLeaderboard(
        pageToLoad,
        PAGE_SIZE
      );
      setRows(rows);
      setHasNext(hasNext);
    } catch (e) {
      setError('랭킹을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(page);
  }, [page]);

  return {
    loading,
    rows,
    page,
    hasNext,
    error,
    nextPage: () => {
      if (hasNext) setPage((p) => p + 1);
    },
    prevPage: () => {
      setPage((p) => (p > 1 ? p - 1 : p));
    },
    reload: () => load(page),
  };
}

