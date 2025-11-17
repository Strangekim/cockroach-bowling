import React from 'react';

interface TitlePageProps {
  onStart: () => void;
  onShowRank?: () => void;
}

export const TitlePage: React.FC<TitlePageProps> = ({
  onStart,
  onShowRank,
}) => {
  return (
    <div className="page">
      <div className="title-bg"></div>
      <div className="title-container">
        <h1 className="title">바퀴벌레 볼링</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="button-base start-button" onClick={onStart}>
            게임 시작
          </button>
          {onShowRank && (
            <button className="button-base game-rank-button" onClick={onShowRank}>
              랭킹 보기
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

