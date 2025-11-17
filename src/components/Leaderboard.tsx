import React from 'react';
import { useLeaderboard } from '../hooks/useLeaderboard';

export const Leaderboard: React.FC = () => {
  const { loading, rows, page, hasNext, error, nextPage, prevPage } =
    useLeaderboard();

  return (
    <div
      style={{
        marginTop: 16,
        paddingTop: 12,
        borderTop: '1px solid #1f2937',
        width: '100%',
        maxWidth: 720,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <div style={{ fontWeight: 700, color: '#e5e7eb' }}>전체 랭킹</div>
      </div>
      {loading && (
        <div style={{ color: '#9ca3af', padding: '12px 0' }}>불러오는 중...</div>
      )}
      {error && (
        <div style={{ color: '#f97373', padding: '12px 0' }}>{error}</div>
      )}
      {!loading && !error && rows.length === 0 && (
        <div style={{ color: '#9ca3af', padding: '12px 0' }}>
          아직 기록이 없습니다.
        </div>
      )}
      <div>
        {rows.map((row, index) => {
          const rank = (page - 1) * 10 + index + 1;
          return (
            <div
              key={rank}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto auto',
                gap: 8,
                alignItems: 'center',
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid #1f2937',
                background: '#020617',
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  minWidth: 32,
                  textAlign: 'center',
                  fontWeight: 800,
                  borderRadius: 9999,
                  padding: '4px 8px',
                  background: '#1f2937',
                  color: '#e5e7eb',
                }}
              >
                {rank}
              </div>
              <div style={{ color: '#e5e7eb' }}>
                {row.nickname || '익명'}
              </div>
              <div
                style={{
                  justifySelf: 'end',
                  padding: '4px 10px',
                  borderRadius: 9999,
                  background: '#111827',
                  color: '#e5e7eb',
                  fontWeight: 800,
                }}
              >
                {row.score.toLocaleString()}
              </div>
              <div
                style={{
                  textAlign: 'right',
                  color: '#9ca3af',
                  fontSize: 12,
                }}
              >
                {row.created_at.slice(0, 10)}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          alignItems: 'center',
          color: '#9ca3af',
          fontSize: 14,
        }}
      >
        <button
          className="button-base"
          style={{ backgroundColor: '#374151' }}
          onClick={prevPage}
          disabled={page === 1}
        >
          이전
        </button>
        <span>페이지 {page}</span>
        <button
          className="button-base"
          style={{ backgroundColor: '#374151' }}
          onClick={nextPage}
          disabled={!hasNext}
        >
          다음
        </button>
      </div>
    </div>
  );
}

