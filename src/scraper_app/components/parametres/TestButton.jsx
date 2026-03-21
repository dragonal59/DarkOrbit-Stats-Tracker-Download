import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader, Check, X } from 'lucide-react';

// onTest doit retourner une Promise<boolean>
export function TestButton({ label = 'Tester', onTest }) {
  const [state, setState] = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'

  const handleClick = async () => {
    if (state === 'loading') return;
    setState('loading');
    try {
      const ok = await onTest();
      setState(ok ? 'success' : 'error');
    } catch {
      setState('error');
    }
    setTimeout(() => setState('idle'), 3000);
  };

  const config = {
    idle: {
      icon: null,
      label,
      color: 'var(--text-muted)',
    },
    loading: {
      icon: <Loader size={12} className="spin" />,
      label: 'Test...',
      color: 'var(--accent-amber)',
    },
    success: {
      icon: <Check size={12} />,
      label: 'OK !',
      color: 'var(--accent-emerald)',
    },
    error: {
      icon: <X size={12} />,
      label: 'Échec',
      color: 'var(--accent-rose)',
    },
  }[state];

  return (
    <button
      type="button"
      className={`test-btn test-btn--${state}`}
      onClick={handleClick}
      style={{ '--test-color': config.color }}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={state}
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          {config.icon}
          {config.label}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

