import { notFound } from 'next/navigation';
import { api, type Category, type ProductPage } from '@/lib/api';
import { ProductGrid } from '@/components/ProductGrid';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cat = (await api<Category[]>('/v1/categories', 300))?.find((c) => c.slug === slug);
  return { title: cat?.nameBn ?? 'ক্যাটাগরি' };
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> }) {
  const { slug } = await params;
  const { page = '1' } = await searchParams;
  const cat = (await api<Category[]>('/v1/categories', 300))?.find((c) => c.slug === slug);
  if (!cat) notFound();
  const data = await api<ProductPage>(`/v1/products?category=${encodeURIComponent(slug)}&page=${Number(page) || 1}&limit=24`);
  return (
    <main className="wrap" style={{ paddingBlock: 20 }}>
      <div className="sec-head"><h2>{cat.nameBn} <small className="en" style={{ color: 'var(--muted)', fontWeight: 400 }}>({cat.productCount.toLocaleString('en-US')})</small></h2></div>
      {data && <ProductGrid data={data} basePath={`/category/${slug}`} />}
    </main>
  );
}
