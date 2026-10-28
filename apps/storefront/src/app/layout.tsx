import type { Metadata, Viewport } from 'next';
import { Hind_Siliguri, Inter } from 'next/font/google';
import { CartProvider } from '@/lib/cart';
import { Header } from '@/components/Header';
import { api, type Category } from '@/lib/api';
import Link from 'next/link';
import './globals.css';

const bn = Hind_Siliguri({ subsets: ['bengali', 'latin'], weight: ['400', '500', '600', '700'], variable: '--f-bn', display: 'swap' });
const en = Inter({ subsets: ['latin'], variable: '--f-en', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'আপনার ফার্মেসি | অনলাইন ঔষধের দোকান', template: '%s | আপনার ফার্মেসি' },
  description: 'লাইসেন্সপ্রাপ্ত ফার্মাসিস্ট দ্বারা যাচাইকৃত ঔষধ, হারবাল পণ্য, ভিটামিন ও স্বাস্থ্যসামগ্রী। সারা বাংলাদেশে হোম ডেলিভারি।',
};
export const viewport: Viewport = { themeColor: '#0F6B3A', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cats = (await api<Category[]>('/v1/categories', 300)) ?? [];
  return (
    <html lang="bn" className={`${bn.variable} ${en.variable}`}>
      <body>
        <CartProvider>
          <Header />
          <nav className="menu"><div className="wrap">
            <Link href="/">হোম</Link>
            {cats.map((c) => <Link key={c.id} href={`/category/${c.slug}`}>{c.nameBn}</Link>)}
          </div></nav>
          {children}
          <footer><div className="wrap">ড্রাগ লাইসেন্স নং: DGDA-XXXX · রেজিস্টার্ড ফার্মাসিস্ট: নাম ও রেজিস্ট্রেশন নং · প্রেসক্রিপশন ছাড়া প্রেসক্রিপশন-ঔষধ বিক্রি হয় না।</div></footer>
        </CartProvider>
      </body>
    </html>
  );
}
