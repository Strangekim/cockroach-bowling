import React, { useEffect, useRef, useState } from 'react';

export const GamePage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current) return;
    // Legacy Three.js 엔진은 game_legacy.html 구조를 기대하므로,
    // iframe으로 기존 게임을 호스팅하는 방식으로 우선 래핑한다.
  }, [ready]);

  const isGameEnd = false;

  return (
    <div className="page game-page">
      <div className="game-screen" ref={containerRef}>
        <iframe
          src="/game_legacy.html"
          title="Cockroach Bowling"
          style={{
            border: 'none',
            width: '100%',
            height: '100%',
          }}
        />
      </div>
    </div>
  );
};

