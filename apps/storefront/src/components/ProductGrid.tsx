import Link from 'next/link';
import { ProductCard } from './ProductCard';
import type { ProductPage } from '@/lib/api';

export function ProductGrid({ data, basePath, query = '' }: { data: ProductPage; basePath: string; query?: string }) {
  if (!data.items.length) return <p className="empty">কোনো পণ্য পাওয়া যায়নি।</p>;
  const pages = Math.ceil(data.total / data.limit);
  const href = (n: number) => `${basePath}?${query ? query + '&' : ''}page=${n}`;
  return (
    <>
      <div className="grid">{data.items.map((p) => <ProductCard key={p.variantId} p={p} />)}</div>
      {pages > 1 && (
        <nav className="pager" aria-label="পেজ">
          {data.page > 1 && <Link href={href(data.page - 1)}>← আগের</Link>}
          <Link href={href(data.page)} aria-current="page">{data.page} / {pages}</Link>
          {data.page < pages && <Link href={href(data.page + 1)}>পরের →</Link>}
        </nav>
      )}
    </>
  );
}
