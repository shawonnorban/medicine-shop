import { ApiError } from './api';
import { useT, type Key } from './i18n';

const P: Record<string, string> = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  orders: 'M6 2h12l2 4v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6zM4 6h16M9 10a3 3 0 0 0 6 0',
  store: 'M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3M9 20v-5h6v5',
  delivery: 'M2 6h11v10H2zM13 9h4l3 3v4h-7zM6 19a1.7 1.7 0 1 0 0-.01M17 19a1.7 1.7 0 1 0 0-.01',
  payment: 'M3 6h18v12H3zM3 10h18M7 15h3',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
  building: 'M4 21V4h10v17M14 9h6v12M8 8h2M8 12h2M8 16h2M17 13h0M17 17h0M2 21h20',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3M15.5 4.3a3.5 3.5 0 0 1 0 6.4',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17zM14.5 7.5l3 3',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  logout: 'M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9',
  chevron: 'M6 9l6 6 6-6',
  x: 'M6 6l12 12M18 6L6 18',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  pill: 'M10.5 20.5a4.95 4.95 0 0 1-7-7l10-10a4.95 4.95 0 0 1 7 7zM8.5 8.5l7 7',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3.3 7.5L12 12.5l8.7-5M12 22V12.5',
  cart: 'M3 4h2l2.4 11.5a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 8H6M9.5 20.5h.01M17 20.5h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
};
export type IconName = keyof typeof P;

export const Icon = ({ name, size = 15 }: { name: IconName; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[name]} /></svg>
);

/** Turns any thrown value into text in the current language. */
export function useErr() {
  const { t } = useT();
  return (e: unknown) => {
    if (!(e instanceof ApiError)) return t('err.error');
    if (e.code === 'invalid_request' && e.message !== e.code) return e.message;
    const k = `err.${e.code}` as Key;
    return t(k, { n: e.count ?? 0 }) === k ? t('err.error') : t(k, { n: e.count ?? 0 });
  };
}

/** Table footer with page controls. */
export function Pager({ page, size, total, onPage, noun }: { page: number; size: number; total: number; onPage: (p: number) => void; noun: string }) {
  const from = total ? (page - 1) * size + 1 : 0, to = Math.min(page * size, total);
  return (
    <footer className="tfoot">
      <span>{from}–{to} of {total} {noun}</span>
      <span className="pg"><button className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button><button className="btn" disabled={to >= total} onClick={() => onPage(page + 1)}>Next</button></span>
    </footer>
  );
}
