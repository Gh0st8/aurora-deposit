import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QR({ value }: { value: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: 360, color: { dark: '#07080d', light: '#ffffff' } })
      .then(setSrc)
      .catch(() => setSrc(''));
  }, [value]);
  return src ? <img className="qr" src={src} alt={`QR code for ${value}`} width={180} height={180} /> : null;
}

export function Copy({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="copy">
      {label && <div className="copy-label">{label}</div>}
      <div className="copy-row">
        <code className="mono">{value}</code>
        <button
          className="btn small"
          onClick={() => {
            navigator.clipboard?.writeText(value).then(() => {
              setDone(true);
              setTimeout(() => setDone(false), 1400);
            });
          }}
        >
          {done ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export const short = (s: string, n = 6) => (s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);

/** Polls `fn` every `ms` while `active` and the tab is visible. */
export function usePoll(fn: () => Promise<void> | void, ms: number, active: boolean, deps: unknown[]) {
  useEffect(() => {
    if (!active) return;
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stop) return;
      if (document.visibilityState === 'visible') {
        try { await fn(); } catch { /* surfaced by fn */ }
      }
      if (!stop) t = setTimeout(tick, ms);
    };
    tick();
    return () => { stop = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ms, ...deps]);
}
