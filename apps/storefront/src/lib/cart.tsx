'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type CartLine = { variantId: number; slug: string; name: string; label: string; price: number; qty: number };
type Cart = { lines: CartLine[]; count: number; total: number; add: (l: Omit<CartLine, 'qty'>, qty?: number) => void; setQty: (variantId: number, qty: number) => void; clear: () => void };

const Ctx = createContext<Cart | null>(null);
const KEY = 'medshop.cart.v1';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  useEffect(() => {
    try { setLines(JSON.parse(localStorage.getItem(KEY) ?? '[]')); } catch {}
  }, []);
  const persist = useCallback((next: CartLine[]) => {
    setLines(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  }, []);

  const value = useMemo<Cart>(() => ({
    lines,
    count: lines.reduce((n, l) => n + l.qty, 0),
    total: lines.reduce((n, l) => n + l.qty * l.price, 0),
    add: (l, qty = 1) => {
      const hit = lines.find((x) => x.variantId === l.variantId);
      persist(hit ? lines.map((x) => (x === hit ? { ...x, qty: x.qty + qty } : x)) : [...lines, { ...l, qty }]);
    },
    setQty: (id, qty) => persist(qty <= 0 ? lines.filter((l) => l.variantId !== id) : lines.map((l) => (l.variantId === id ? { ...l, qty } : l))),
    clear: () => persist([]),
  }), [lines, persist]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart outside CartProvider');
  return c;
}
