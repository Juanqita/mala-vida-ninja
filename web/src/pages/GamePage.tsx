import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import Phaser from 'phaser';
import { GameScene, setGameCallbacks } from '@/game/GameScene';
import { setGameDuration } from '@/game/config';
import { useGame } from '@/context/GameContext';

export default function GamePage() {
  const [, navigate] = useLocation();
  const { auth, setGameEnd } = useGame();
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!auth.token) {
      navigate('/');
      return;
    }
    if (!hostRef.current || gameRef.current) return;

    setGameDuration(auth.gameDurationSeconds);

    setGameCallbacks({
      onGameEnd: (data) => {
        setGameEnd(data);
        setTimeout(() => navigate('/result'), 60);
      },
    });

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      backgroundColor: '#1E0A3C',
      scene: [GameScene],
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: '100%',
        height: '100%',
      },
      input: { activePointers: 3 },
      disableContextMenu: true,
      render: { antialias: true, powerPreference: 'high-performance' },
      fps: { target: 60, forceSetTimeOut: false },
    });

    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className="game-canvas-host w-screen" style={{ height: '100dvh', background: '#1E0A3C' }} />;
}
