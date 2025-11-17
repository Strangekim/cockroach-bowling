import React from 'react';
import { useLeaderboard } from '../hooks/useLeaderboard';

// 스타일을 결정하는 헬퍼 함수
const getRankStyle = (rank: number) => {
  const styles: {
    row: React.CSSProperties;
    rankBadge: React.CSSProperties;
    nickname: React.CSSProperties;
    score: React.CSSProperties;
  } = {
    row: {
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto auto',
      gap: 12,
      alignItems: 'center',
      padding: '10px 12px',
      borderRadius: 10,
      border: '1px solid #374151', // 더 밝은 테두리
      background: '#111827', // 더 밝은 배경
      marginBottom: 8,
      transition: 'all 0.2s ease-in-out',
    },
    rankBadge: {
      minWidth: 36,
      textAlign: 'center',
      fontWeight: 900,
      borderRadius: 8,
      padding: '6px 10px',
      fontSize: 16,
      background: '#374151',
      color: '#f3f4f6',
    },
    nickname: {
      fontWeight: 600,
      fontSize: 16,
      color: '#f3f4f6',
    },
    score: {
      justifySelf: 'end',
      padding: '6px 12px',
      borderRadius: 8,
      background: '#1f2937',
      color: '#f9fafb',
      fontWeight: 800,
      fontSize: 16,
    },
  };

  switch (rank) {
    case 1:
      styles.row.background = 'linear-gradient(145deg, #2d2300, #1b1400)';
      styles.row.border = '1px solid #ffcf40';
      styles.row.boxShadow = '0 0 12px rgba(255, 215, 0, 0.4)';
      styles.rankBadge.background = '#ffd700';
      styles.rankBadge.color = '#000';
      styles.rankBadge.boxShadow = '0 0 8px rgba(255, 215, 0, 0.7)';
      styles.nickname.color = '#ffd700';
      break;
    case 2:
      styles.row.background = 'linear-gradient(145deg, #2d3748, #1a202c)';
      styles.row.border = '1px solid #c0c0c0';
      styles.row.boxShadow = '0 0 10px rgba(192, 192, 192, 0.3)';
      styles.rankBadge.background = '#c0c0c0';
      styles.rankBadge.color = '#000';
      styles.rankBadge.boxShadow = '0 0 6px rgba(192, 192, 192, 0.6)';
      styles.nickname.color = '#e2e8f0';
      break;
    case 3:
      styles.row.background = 'linear-gradient(145deg, #4a2c13, #3b200a)';
      styles.row.border = '1px solid #cd7f32';
      styles.row.boxShadow = '0 0 8px rgba(205, 127, 50, 0.3)';
      styles.rankBadge.background = '#cd7f32';
      styles.rankBadge.color = '#000';
      styles.rankBadge.boxShadow = '0 0 5px rgba(205, 127, 50, 0.6)';
      styles.nickname.color = '#e2e8f0';
      break;
    default:
      if (rank <= 10) {
        styles.row.border = '1px solid #4a5568';
        styles.rankBadge.background = 'linear-gradient(145deg, #4f46e5, #3730a3)';
        styles.rankBadge.color = '#fff';
      }
      break;
  }

  return styles;
};

export const Leaderboard: React.FC = () => {
  const { loading, rows, page, hasNext, error, nextPage, prevPage } =
    useLeaderboard();

  return (
    <div
      style={{
        marginTop: 24,
        paddingTop: 16,
        borderTop: '2px solid #374151',
        width: '100%',
        maxWidth: 720,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <h2 style={{ fontWeight: 800, color: '#e5e7eb', fontSize: 24 }}>
          전체 랭킹
        </h2>
      </div>
      {loading && (
        <div style={{ color: '#9ca3af', padding: '16px 0', fontSize: 16 }}>
          불러오는 중...
        </div>
      )}
      {error && (
        <div style={{ color: '#f87171', padding: '16px 0', fontSize: 16 }}>
          {error}
        </div>
      )}
      {!loading && !error && rows.length === 0 && (
        <div style={{ color: '#9ca3af', padding: '16px 0', fontSize: 16 }}>
          아직 기록이 없습니다.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row, index) => {
          const rank = (page - 1) * 10 + index + 1;
          const styles = getRankStyle(rank);

          return (
            <div key={rank} style={styles.row}>
              <div style={styles.rankBadge}>{rank}</div>
              <div style={styles.nickname}>{row.nickname || '익명'}</div>
              <div style={styles.score}>{row.score.toLocaleString()}</div>
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
          marginTop: 16,
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
};

