# Medicine Shop

দ্রুত অনলাইন ঔষধের দোকান (বাংলাদেশ): স্টোরফ্রন্ট, API, ইনভেন্টরি ও (পরবর্তী ধাপে) অ্যাডমিন + POS।

| অংশ | প্রযুক্তি |
|---|---|
| `apps/storefront` | Next.js 15 (ISR, SSR), React 19 |
| `apps/api` | Fastify 5, TypeScript, `postgres` driver, zod |
| `db/migrations` | PostgreSQL 16 (pg_trgm সার্চ, লেজার-ভিত্তিক স্টক) |
| `docker-compose.yml` | Postgres, Redis, Meilisearch (Redis/Meilisearch পরের ধাপে ব্যবহৃত হবে) |

## চালানোর নিয়ম

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
export DATABASE_URL=postgres://medshop:medshop@localhost:5432/medshop
pnpm db:migrate
pnpm db:seed                                  # ২১টি নমুনা পণ্য
pnpm --filter @medshop/api db:seed:bulk 5000  # (ঐচ্ছিক) গতি পরীক্ষার জন্য ৫০০০ পণ্য
pnpm dev:api    # http://localhost:4000
pnpm dev:web    # http://localhost:3000
```

## API (ধাপ ১)

- `GET /health`
- `GET /v1/categories`
- `GET /v1/products?category=&company=&rx=&featured=1&q=&sort=name|price_asc|price_desc|discount&page=&limit=`
- `GET /v1/products/:slug` (প্যাক/ভ্যারিয়েন্ট, স্টক, মেয়াদ, বিকল্প ঔষধ)
- `GET /v1/search/suggest?q=` (প্রিফিক্স + টাইপো-সহনশীল)

### অর্ডার API (ধাপ ২)

- `POST /v1/otp/request` `{phone}` → `POST /v1/otp/verify` `{phone, code}` → ৩০ মিনিটের সাইন করা টোকেন
- `POST /v1/orders` `{token, name, phone, address, zone, items:[{variantId, qty}]}` (দাম সবসময় সার্ভার ডাটাবেস থেকে)
- `GET /v1/orders/:orderNo?phone=` · `POST /v1/orders/:orderNo/cancel` `{phone}`
- টেস্ট: `pnpm --filter @medshop/api test` (সিড করা ডাটাবেস দরকার)

SMS প্রোভাইডার এখনো স্টাব (`lib/otp.ts`); `OTP_DEV=1` হলে কোড রেসপন্সে ফেরত আসে। প্রোডাকশনে `APP_SECRET` বাধ্যতামূলক।

## ডিজাইন সিদ্ধান্ত

- **স্টক = লেজার।** `stock_movements` শুধু যোগ হয়, কখনো বদলায় না। অনলাইন অর্ডার ও POS একই লেজারে লেখে, তাই ওভারসেল হয় না। মেয়াদোত্তীর্ণ ব্যাচ বিক্রয়যোগ্য স্টকে গণ্য হয় না।
- **ব্যাচ ও মেয়াদ** প্রতিটি ভ্যারিয়েন্টে, ভবিষ্যতে FEFO (আগে মেয়াদ শেষ হওয়া ব্যাচ আগে বিক্রি)।
- **লিস্টিং গতি:** পেজ আগে বেছে নিয়ে তারপর শুধু ওই ২৪টির স্টক হিসাব করা হয়। ৫,০০০+ পণ্যে লিস্টিং ~৩০–৫০ মি.সে.।
- **স্টোরফ্রন্ট** ISR-এ (৬০ সেকেন্ড রিভ্যালিডেট) স্ট্যাটিক HTML হিসেবে সার্ভ হয়। কার্ট ক্লায়েন্ট-সাইড (`localStorage`)।
- **অর্ডারে স্টক:** অর্ডার হওয়ামাত্র ব্যাচ লক করে, আগে মেয়াদ শেষ হবে এমন ব্যাচ থেকে লেজারে বিয়োগ লেখা হয়। বাতিলে উল্টো এন্ট্রি। একসাথে দুটি অর্ডার একই স্টক নিতে পারে না (টেস্ট করা)।
- Rx ঔষধে "কার্টে যোগ" নেই, প্রেসক্রিপশন ফ্লো (ধাপ ৪) না আসা পর্যন্ত অর্ডার করা যায় না।

## বাকি ধাপ

২. ✅ চেকআউট, অর্ডার, গেস্ট OTP, FEFO স্টক বরাদ্দ  ৩. অ্যাডমিন + POS  ৪. প্রেসক্রিপশন, bKash/Nagad, কুরিয়ার  ৫. রিপোর্ট, লোড টেস্ট, সিকিউরিটি রিভিউ
