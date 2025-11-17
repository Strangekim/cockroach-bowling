import { useEffect } from 'react';

interface VisibilityChangeHandlers {
  onVisible: () => void;
  onHidden: () => void;
}

export function useVisibilityChange({
  onVisible,
  onHidden,
}: VisibilityChangeHandlers): void {
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        onVisible();
      } else {
        onHidden();
      }
    };

    document.addEventListener('visibilitychange', handler);

    return () => {
      document.removeEventListener('visibilitychange', handler);
    };
  }, [onVisible, onHidden]);
}

