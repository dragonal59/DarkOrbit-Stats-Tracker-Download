import { useEffect, useState } from 'react';

export function useAnimatedCounter(target, duration = 1500) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let start = 0;
    const frameDuration = 16;
    const increment = target / (duration / frameDuration || 1);

    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setValue(target);
        clearInterval(timer);
      } else {
        setValue(Math.floor(start));
      }
    }, frameDuration);

    return () => clearInterval(timer);
  }, [target, duration]);

  return value;
}

