import { api, type ProductPage } from '@/lib/api';
import { ProductGrid } from '@/components/ProductGrid';

export const metadata = { title: 'সার্চ' };

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  const { q = '', sort = 'name', page = '1' } = await searchParams;
  const qs = new URLSearchParams({ sort, page: String(Number(page) || 1), limit: '24', ...(q ? { q } : {}) });
  const data = await api<ProductPage>(`/v1/products?${qs}`, 30);
  return (
    <main className="wrap" style={{ paddingBlock: 20 }}>
      <div className="sec-head"><h2>{q ? `"${q}" এর ফলাফল` : 'সব পণ্য'}</h2><span className="en">{data?.total ?? 0} items</span></div>
      {data && <ProductGrid data={data} basePath="/search" query={new URLSearchParams({ ...(q ? { q } : {}), sort }).toString()} />}
    </main>
  );
}
