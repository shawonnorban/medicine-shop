import { sql } from './client.js';

type V = { label: string; unit?: string; mrp: number; price: number; qty: number };
type P = {
  name: string; generic: string; company: string; cat: string;
  form?: string; strength?: string; rx?: 'otc' | 'prescription'; image?: string;
  desc: string; usage?: string; warn?: string; variants: V[];
};

const categories = [
  ['medicine', 'ঔষধ', 'Medicine', '💊'],
  ['herbal', 'হারবাল পণ্য', 'Herbal Products', '🌿'],
  ['vitamins', 'ভিটামিন ও সাপ্লিমেন্ট', 'Vitamins & Supplements', '🧴'],
  ['healthcare', 'স্বাস্থ্যসামগ্রী', 'Health Care', '🩺'],
  ['skincare', 'স্কিন ও পার্সোনাল কেয়ার', 'Skincare & Personal Care', '🧼'],
  ['mother-baby', 'মা ও শিশু', 'Mother & Baby', '🍼'],
] as const;

const products: P[] = [
  { name: 'Napa', generic: 'Paracetamol', company: 'Beximco Pharmaceuticals', cat: 'medicine', form: 'Tablet', strength: '500 mg',
    desc: 'জ্বর, মাথাব্যথা, দাঁতব্যথা ও শরীর ব্যথায় ব্যবহৃত হয়।',
    usage: 'প্রাপ্তবয়স্ক: ১–২টি ট্যাবলেট প্রয়োজনে ৪–৬ ঘণ্টা পরপর। দিনে সর্বোচ্চ ৮টি।',
    warn: 'লিভারের সমস্যা থাকলে বা নিয়মিত মদ্যপান করলে ডাক্তারের পরামর্শ নিন।',
    variants: [{ label: '১ পাতা (১০ টি)', mrp: 12, price: 12, qty: 800 }, { label: '১ বক্স (১০ পাতা)', mrp: 120, price: 115, qty: 90 }] },
  { name: 'Ace', generic: 'Paracetamol', company: 'Square Pharmaceuticals', cat: 'medicine', form: 'Tablet', strength: '500 mg',
    desc: 'জ্বর ও ব্যথানাশক।', variants: [{ label: '১ পাতা (১০ টি)', mrp: 12, price: 11, qty: 640 }] },
  { name: 'Fast', generic: 'Paracetamol', company: 'Renata', cat: 'medicine', form: 'Tablet', strength: '500 mg',
    desc: 'জ্বর ও ব্যথানাশক।', variants: [{ label: '১ পাতা (১০ টি)', mrp: 12, price: 12, qty: 410 }] },
  { name: 'Seclo', generic: 'Omeprazole', company: 'Square Pharmaceuticals', cat: 'medicine', form: 'Capsule', strength: '20 mg',
    desc: 'গ্যাস্ট্রিক ও অ্যাসিডিটির চিকিৎসায়।', usage: 'খাবারের ৩০ মিনিট আগে।', variants: [{ label: '১ পাতা (১০ টি)', mrp: 70, price: 66, qty: 300 }] },
  { name: 'Sergel', generic: 'Esomeprazole', company: 'Healthcare Pharmaceuticals', cat: 'medicine', form: 'Capsule', strength: '20 mg',
    desc: 'গ্যাস্ট্রিক আলসার ও GERD-এ।', variants: [{ label: '১ পাতা (১০ টি)', mrp: 70, price: 68, qty: 250 }] },
  { name: 'Moxacil', generic: 'Amoxicillin', company: 'Square Pharmaceuticals', cat: 'medicine', form: 'Capsule', strength: '500 mg', rx: 'prescription',
    desc: 'ব্যাকটেরিয়াজনিত সংক্রমণের অ্যান্টিবায়োটিক।', warn: 'শুধু রেজিস্টার্ড ডাক্তারের প্রেসক্রিপশন অনুযায়ী সেবন করুন।',
    variants: [{ label: '১ পাতা (৮ টি)', mrp: 80, price: 76, qty: 210 }] },
  { name: 'Finix', generic: 'Fexofenadine', company: 'Beximco Pharmaceuticals', cat: 'medicine', form: 'Tablet', strength: '120 mg',
    desc: 'অ্যালার্জি ও হাঁচি-সর্দিতে।', variants: [{ label: '১ পাতা (১০ টি)', mrp: 80, price: 75, qty: 180 }] },
  { name: 'Monas', generic: 'Montelukast', company: 'Acme Laboratories', cat: 'medicine', form: 'Tablet', strength: '10 mg', rx: 'prescription',
    desc: 'অ্যাজমা ও অ্যালার্জিক রাইনাইটিসে।', variants: [{ label: '১ পাতা (১০ টি)', mrp: 150, price: 140, qty: 120 }] },
  { name: 'Himalaya Tulsi', generic: 'Tulsi', company: 'Himalaya', cat: 'herbal', form: 'Tablet',
    desc: 'রোগ প্রতিরোধ ক্ষমতা বাড়াতে সহায়ক হারবাল ট্যাবলেট।', variants: [{ label: '৬০ ট্যাবলেট', mrp: 320, price: 320, qty: 60 }] },
  { name: 'Ashwagandha Capsule', generic: 'Ashwagandha', company: 'Himalaya', cat: 'herbal', form: 'Capsule',
    desc: 'স্ট্রেস কমাতে ও শক্তি বাড়াতে সহায়ক।', variants: [{ label: '৬০ ক্যাপসুল', mrp: 760, price: 650, qty: 44 }] },
  { name: 'Black Seed Oil', generic: 'Nigella sativa', company: 'Hemani', cat: 'herbal', form: 'Oil',
    desc: 'কালোজিরা তেল, প্রাকৃতিক সাপ্লিমেন্ট।', variants: [{ label: '১০০ মি.লি.', mrp: 550, price: 495, qty: 35 }] },
  { name: 'Centrum Multivitamin', generic: 'Multivitamin', company: 'Pfizer', cat: 'vitamins', form: 'Tablet',
    desc: 'দৈনিক মাল্টিভিটামিন ও মিনারেল।', variants: [{ label: '৩০ ট্যাবলেট', mrp: 1250, price: 1250, qty: 18 }, { label: '১০০ ট্যাবলেট', mrp: 3600, price: 3400, qty: 9 }] },
  { name: 'Vitamin D3', generic: 'Cholecalciferol', company: "Nature's Bounty", cat: 'vitamins', form: 'Softgel', strength: '1000 IU',
    desc: 'হাড় ও দাঁতের সুস্থতায়।', variants: [{ label: '১০০ সফটজেল', mrp: 900, price: 780, qty: 25 }] },
  { name: 'Calbo-D', generic: 'Calcium + Vitamin D3', company: 'Square Pharmaceuticals', cat: 'vitamins', form: 'Tablet',
    desc: 'ক্যালসিয়াম ও ভিটামিন ডি৩ সাপ্লিমেন্ট।', variants: [{ label: '১ পাতা (১০ টি)', mrp: 90, price: 85, qty: 220 }] },
  { name: 'Omron BP Monitor HEM-7121', generic: 'Blood pressure monitor', company: 'Omron', cat: 'healthcare',
    desc: 'ডিজিটাল ব্লাড প্রেসার মনিটর।', variants: [{ label: '১ পিস', unit: 'Piece', mrp: 4768, price: 4291, qty: 8 }] },
  { name: 'Fine Test Glucometer', generic: 'Glucose meter', company: 'Fine Test', cat: 'healthcare',
    desc: 'ডায়াবেটিস পর্যবেক্ষণের জন্য গ্লুকোমিটার।', variants: [{ label: '১ সেট', mrp: 1600, price: 1440, qty: 14 }] },
  { name: 'Digital Thermometer', generic: 'Thermometer', company: 'Omron', cat: 'healthcare',
    desc: 'দ্রুত ও নির্ভুল শরীরের তাপমাত্রা মাপার যন্ত্র।', variants: [{ label: '১ পিস', mrp: 350, price: 320, qty: 40 }] },
  { name: 'Savlon Soap', generic: 'Antiseptic soap', company: 'ACI', cat: 'skincare',
    desc: 'অ্যান্টিসেপটিক সাবান।', variants: [{ label: '১০০ গ্রাম', mrp: 65, price: 65, qty: 300 }] },
  { name: 'Cetaphil Gentle Cleanser', generic: 'Cleanser', company: 'Galderma', cat: 'skincare',
    desc: 'সংবেদনশীল ত্বকের জন্য মৃদু ক্লিনজার।', variants: [{ label: '২৫০ মি.লি.', mrp: 1450, price: 1300, qty: 20 }] },
  { name: 'Nido 1+', generic: 'Milk powder', company: 'Nestlé', cat: 'mother-baby',
    desc: '১ বছরের বেশি বয়সী শিশুদের জন্য গুঁড়া দুধ।', variants: [{ label: '৩৫০ গ্রাম', mrp: 495, price: 495, qty: 60 }] },
  { name: 'Cerelac Stage 1', generic: 'Infant cereal', company: 'Nestlé', cat: 'mother-baby',
    desc: 'শিশুর প্রথম খাবার, গমের সাথে তিন ফল।', variants: [{ label: '৪০০ গ্রাম', mrp: 400, price: 400, qty: 50 }] },
];

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

await sql.begin(async (tx) => {
  await tx`TRUNCATE stock_movements, batches, product_variants, products, generics, companies, categories, suppliers RESTART IDENTITY CASCADE`;
  const [sup] = await tx`INSERT INTO suppliers (name, phone) VALUES ('Sample Distributor', '01700000000') RETURNING id`;

  const catId = new Map<string, number>();
  let order = 0;
  for (const [slug, bn, en, icon] of categories) {
    const [r] = await tx`INSERT INTO categories (name_bn, name_en, slug, icon, sort_order) VALUES (${bn}, ${en}, ${slug}, ${icon}, ${order++}) RETURNING id`;
    catId.set(slug, r.id);
  }

  const gen = new Map<string, number>(), comp = new Map<string, number>();
  for (const p of products) {
    if (!gen.has(p.generic)) gen.set(p.generic, (await tx`INSERT INTO generics (name) VALUES (${p.generic}) RETURNING id`)[0].id);
    if (!comp.has(p.company)) comp.set(p.company, (await tx`INSERT INTO companies (name, slug) VALUES (${p.company}, ${slugify(p.company)}) RETURNING id`)[0].id);
  }

  let barcode = 8900000000000;
  for (const p of products) {
    const [row] = await tx`
      INSERT INTO products (slug, name, generic_id, company_id, category_id, dosage_form, strength, rx, description, usage_info, warnings)
      VALUES (${slugify(p.name + ' ' + (p.strength ?? '') + ' ' + (p.form ?? ''))}, ${p.name}, ${gen.get(p.generic)!}, ${comp.get(p.company)!}, ${catId.get(p.cat)!},
              ${p.form ?? null}, ${p.strength ?? null}, ${p.rx ?? 'otc'}, ${p.desc}, ${p.usage ?? null}, ${p.warn ?? null})
      RETURNING id`;
    let so = 0;
    for (const v of p.variants) {
      const [vr] = await tx`
        INSERT INTO product_variants (product_id, label, unit, barcode, mrp, price, sort_order)
        VALUES (${row.id}, ${v.label}, ${v.unit ?? 'Piece'}, ${String(barcode++)}, ${v.mrp}, ${v.price}, ${so++}) RETURNING id`;
      // two batches per variant: one near expiry (sold first, FEFO), one fresh
      const near = Math.ceil(v.qty / 4), fresh = v.qty - near;
      for (const [no, months, qty] of [['B-A', 4, near], ['B-B', 20, fresh]] as const) {
        const [b] = await tx`
          INSERT INTO batches (variant_id, supplier_id, batch_no, expiry_date, cost_price)
          VALUES (${vr.id}, ${sup.id}, ${no}, CURRENT_DATE + (${months} * 30), ${Math.round(v.price * 0.8 * 100) / 100}) RETURNING id`;
        await tx`INSERT INTO stock_movements (batch_id, qty, reason, ref_type) VALUES (${b.id}, ${qty}, 'purchase', 'seed')`;
      }
    }
  }
  await tx`UPDATE products SET is_featured = true`;
});
console.log(`seeded ${products.length} products`);
await sql.end();
