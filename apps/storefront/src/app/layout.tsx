import type { Metadata, Viewport } from 'next';
import { Hind_Siliguri, Inter } from 'next/font/google';
import { CartProvider } from '@/lib/cart';
import { Header } from '@/components/Header';
import { FloatingCart } from '@/components/FloatingCart';
import { api, getConfig, type Category } from '@/lib/api';
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
  const [cats, { store }] = await Promise.all([api<Category[]>('/v1/categories', 60).then((c) => c ?? []), getConfig()]);
  return (
    <html lang="bn" className={`${bn.variable} ${en.variable}`}>
      <body>
        <CartProvider>
          <Header store={store} />
          <nav className="menu"><div className="wrap">
            <Link href="/">হোম</Link>
            {cats.map((c) => <Link key={c.id} href={`/category/${c.slug}`}>{c.nameBn}</Link>)}
            <Link href="/generics">জেনেরিক</Link>
          </div></nav>
          {children}
          <footer className="sitefoot">
            <div className="wrap fgrid">
              <div className="fbrand">
                <Link className="logo" href="/"><i>+</i><span><b>{store.store_name}</b><small>{store.tagline}</small></span></Link>
                {store.address && <p><b>ঠিকানা:</b> {store.address}</p>}
                {store.phone && <p><b>মোবাইল:</b> <span className="en">{store.phone}</span></p>}
                {store.email && <p><b>ইমেইল:</b> <span className="en">{store.email}</span></p>}
                {store.hours_text && <p><b>সেবার সময়:</b> {store.hours_text}</p>}
              </div>
              <div><h3>গ্রাহক সেবা</h3><ul>
                <li><Link href="/">প্রশ্নোত্তর (FAQ)</Link></li><li><Link href="/">অর্ডার রিকোয়েস্ট</Link></li>
                <li><Link href="/prescription">প্রেসক্রিপশন আপলোড</Link></li><li><Link href="/">বিশেষ অফার</Link></li><li><Link href="/">কীভাবে অর্ডার করবেন</Link></li>
              </ul></div>
              <div><h3>সাপোর্ট</h3><ul>
                <li><Link href="/">আমাদের সম্পর্কে</Link></li><li><Link href="/">যোগাযোগ</Link></li><li><Link href="/">রিটার্ন পলিসি</Link></li>
                <li><Link href="/">শর্তাবলী</Link></li><li><Link href="/">প্রাইভেসি পলিসি</Link></li>
              </ul></div>
              <div><h3>পেমেন্ট মাধ্যম</h3><p className="paychips en"><span>COD</span><span>bKash</span><span>Nagad</span><span>Card</span></p></div>
            </div>
            <div className="fbar"><div className="wrap">© {new Date().getFullYear()} {store.store_name}। {store.drug_license && `ড্রাগ লাইসেন্স নং: ${store.drug_license}`}{store.pharmacist_name && ` · রেজিস্টার্ড ফার্মাসিস্ট: ${store.pharmacist_name}${store.pharmacist_reg ? ` (${store.pharmacist_reg})` : ''}`}। প্রেসক্রিপশন ছাড়া প্রেসক্রিপশন-ঔষধ বিক্রি হয় না।</div></div>
          </footer>
          <FloatingCart />
        </CartProvider>
      </body>
    </html>
  );
}
