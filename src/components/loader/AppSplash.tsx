import React, { useEffect, useState } from 'react';
import { BrandLoader } from './BrandLoader';

const SPLASH_SESSION_KEY = 'mk_solutions_splash_shown_v1';

interface AppSplashProps {
  ready?: boolean;
  onFinished?: () => void;
}

/**
 * AppSplash (D1.2):
 * Uses BrandLoader (size="lg", variant="splash"), plays once per session,
 * minimum 900 ms, then triggers BrandLoader exit (arc completes turn, logo scales to 1.05 and slides away).
 */
export const AppSplash: React.FC<AppSplashProps> = ({ ready = true, onFinished }) => {
  const [visible, setVisible] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SPLASH_SESSION_KEY) !== '1';
    } catch {
      return false;
    }
  });
  const [minElapsed, setMinElapsed] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!visible) {
      onFinished?.();
      return;
    }

    const minTimer = window.setTimeout(() => {
      setMinElapsed(true);
    }, 900);

    return () => {
      window.clearTimeout(minTimer);
    };
  }, [visible, onFinished]);

  useEffect(() => {
    if (!visible || !minElapsed || !ready || exiting) return;
    setExiting(true);
  }, [visible, minElapsed, ready, exiting]);

  const handleExitComplete = () => {
    try {
      sessionStorage.setItem(SPLASH_SESSION_KEY, '1');
    } catch {
      // ignore storage errors
    }
    setVisible(false);
    onFinished?.();
  };

  if (!visible) return null;

  return (
    <BrandLoader
      size="lg"
      variant="splash"
      label="Loading workspace"
      exiting={exiting}
      onExitComplete={handleExitComplete}
    />
  );
};
