import React, { useState } from 'react';
import { TitlePage } from './pages/TitlePage';
import { GamePage } from './pages/GamePage';
import { Leaderboard } from './components/Leaderboard';

type View = 'title' | 'game';

export const App: React.FC = () => {
  const [view, setView] = useState<View>('title');

  return (
    <>
      {view === 'title' && (
        <div className="page">
          <div className="title-bg"></div>
          <div className="title-container">
            <h1 className="title">바퀴벌레 볼링</h1>
            <TitlePage onStart={() => setView('game')} />
            <Leaderboard />
          </div>
        </div>
      )}
      {view === 'game' && <GamePage />}
    </>
  );
};
