import type { Metadata, Viewport } from 'next';
import { Hind_Siliguri, Inter } from 'next/font/google';
import { CartProvider } from '@/lib/cart';
import { Header } from '@/components/Header';
import { FloatingCart } from '@/components/FloatingCart';
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
          <footer className="sitefoot">
            <div className="wrap fgrid">
              <div className="fbrand">
                <Link className="logo" href="/"><i>+</i><span><b>আপনার ফার্মেসি</b><small>স্বাস্থ্য আমাদের অগ্রাধিকার</small></span></Link>
                <p><b>ঠিকানা:</b> আপনার ঠিকানা, ঢাকা</p>
                <p><b>মোবাইল:</b> <span className="en">+880 1XXX-XXXXXX</span></p>
                <p><b>ইমেইল:</b> <span className="en">info@example.com</span></p>
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
            <div className="fbar"><div className="wrap">© {new Date().getFullYear()} আপনার ফার্মেসি। ড্রাগ লাইসেন্স নং: DGDA-XXXX · রেজিস্টার্ড ফার্মাসিস্ট: নাম ও রেজিস্ট্রেশন নং। প্রেসক্রিপশন ছাড়া প্রেসক্রিপশন-ঔষধ বিক্রি হয় না।</div></div>
          </footer>
          <FloatingCart />
        </CartProvider>
      </body>
    </html>
  );
}
