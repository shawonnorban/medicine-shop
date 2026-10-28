'use client';
import Link from 'next/link';
import { useCart } from '@/lib/cart';

export function FloatingCart() {
  const cart = useCart();
  return (
    <Link href="/cart" className="fcart" aria-label={`কার্ট, ${cart.count} টি পণ্য`}>
      <span className="fc-top">{cart.count} Items</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1.3 2.6h3.4l2.6 13.8h12.8l2.4-10.2H5.4" /><circle cx="9.9" cy="20.9" r="2" /><circle cx="17.7" cy="20.9" r="2" /></svg>
      <span className="fc-bot en">৳{cart.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
    </Link>
  );
}
