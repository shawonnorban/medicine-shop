export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type Category = { id: number; slug: string; nameBn: string; nameEn: string; icon: string | null; productCount: number };
export type ProductCardData = {
  slug: string; name: string; dosageForm: string | null; strength: string | null; rx: 'otc' | 'prescription' | 'controlled';
  imageUrl: string | null; generic: string | null; company: string | null; categorySlug: string | null;
  variantId: number; variantLabel: string; unit: string; price: number; mrp: number; stock: number;
};
export type Variant = { id: number; label: string; unit: string; price: number; mrp: number; stock: number; nearestExpiry: string | null };
export type Alternative = { slug: string; name: string; strength: string | null; company: string | null; price: number; mrp: number; variantLabel: string };
export type Related = { slug: string; name: string; strength: string | null; imageUrl: string | null; company: string | null; price: number; mrp: number };
export type ProductDetail = Omit<ProductCardData, 'variantId' | 'variantLabel' | 'unit' | 'price' | 'mrp' | 'stock'> & {
  description: string | null; usage: string | null; warnings: string | null; companySlug: string | null; categoryNameBn: string | null;
  variants: Variant[]; alternatives: Alternative[]; related: Related[];
};
export type ProductPage = { items: ProductCardData[]; total: number; page: number; limit: number };

// Catalog pages are rendered once and revalidated in the background, so visitors get static HTML.
export async function api<T>(path: string, revalidate = 60): Promise<T | null> {
  const res = await fetch(API_URL + path, { next: { revalidate } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

export const taka = (n: number) => '৳' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
export const savePct = (price: number, mrp: number) => (mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0);

export type Zone = { code: string; nameBn: string; fee: number; freeOver: number | null; eta: string | null };
export type PaymentOption = { code: string; nameBn: string; instructions: string | null };
export type StoreConfig = { store: Record<string, string>; zones: Zone[]; payments: PaymentOption[] };

const FALLBACK: StoreConfig = {
  store: { store_name: 'আপনার ফার্মেসি', tagline: '', phone: '', address: '', email: '', drug_license: '', pharmacist_name: '', pharmacist_reg: '', announcement: '', whatsapp: '', facebook_url: '', hours_text: '' },
  zones: [], payments: [],
};
/** Store info and options come from the admin settings; fall back to blanks so a brief API outage never breaks page rendering. */
export async function getConfig(): Promise<StoreConfig> {
  try { return (await api<StoreConfig>('/v1/config', 30)) ?? FALLBACK; } catch { return FALLBACK; }
}
