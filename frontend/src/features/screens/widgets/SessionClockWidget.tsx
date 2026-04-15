import { useEffect, useMemo, useState } from 'react';

type SessionClockWidgetProps = {
  format?: '12h' | '24h';
  showSeconds?: boolean;
};

export default function SessionClockWidget({ format = '24h', showSeconds = false }: SessionClockWidgetProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), showSeconds ? 1000 : 15000);
    return () => window.clearInterval(interval);
  }, [showSeconds]);

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat('fr-FR', {
        hour: format === '12h' ? 'numeric' : '2-digit',
        minute: '2-digit',
        second: showSeconds ? '2-digit' : undefined,
        hour12: format === '12h'
      }),
    [format, showSeconds]
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long'
      }),
    []
  );

  return (
    <div style={{ display: 'grid', gap: '0.4rem', alignContent: 'center', justifyItems: 'center', height: '100%' }}>
      <strong style={{ fontSize: 'clamp(1.4rem, 3vw, 2.4rem)', lineHeight: 1 }}>{formatter.format(now)}</strong>
      <small style={{ textTransform: 'capitalize' }}>{dateFormatter.format(now)}</small>
    </div>
  );
}
