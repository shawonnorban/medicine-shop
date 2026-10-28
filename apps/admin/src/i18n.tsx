import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type Lang = 'en' | 'bn';

const EN = {
  'app.name': 'Pharmacy', 'app.admin': 'Admin Console',
  'nav.dashboard': 'Dashboard', 'nav.orders': 'Orders', 'nav.store': 'Store details', 'nav.delivery': 'Delivery', 'nav.payment': 'Payments',
  'nav.categories': 'Categories', 'nav.companies': 'Companies', 'nav.staff': 'Users', 'nav.audit': 'Audit log',
  'grp.sales': 'Sales', 'grp.catalog': 'Catalog', 'grp.settings': 'Settings', 'grp.system': 'System',
  'common.add': 'Add', 'common.edit': 'Edit', 'common.delete': 'Delete', 'common.save': 'Save', 'common.cancel': 'Cancel', 'common.close': 'Close',
  'common.search': 'Search…', 'common.empty': 'Nothing here yet', 'common.saved': 'Saved', 'common.deleted': 'Deleted', 'common.loading': 'Loading…',
  'common.confirmDelete': 'Delete this item?', 'common.on': 'On', 'common.off': 'Off', 'common.active': 'Active', 'common.inactive': 'Inactive',
  'common.rows': 'rows', 'common.logout': 'Sign out', 'common.all': 'All', 'common.optional': 'optional',
  'login.title': 'Sign in', 'login.sub': 'Pharmacy admin console', 'login.email': 'Email', 'login.password': 'Password', 'login.submit': 'Sign in',
  'role.admin': 'Admin', 'role.pharmacist': 'Pharmacist', 'role.cashier': 'Cashier',
  'dash.title': 'Overview', 'dash.salesToday': 'Sales today', 'dash.ordersToday': 'Orders today', 'dash.pending': 'Pending', 'dash.toShip': 'To ship',
  'dash.lowStock': 'Low stock', 'dash.expiring': 'Expiring soon', 'dash.lowStockHint': 'variants at {n} or fewer', 'dash.expiringHint': 'batches within {n} days',
  'dash.recent': 'Recent orders', 'dash.viewAll': 'View all',
  'orders.title': 'Orders', 'orders.search': 'Order no, phone or name', 'orders.order': 'Order', 'orders.customer': 'Customer', 'orders.total': 'Total',
  'orders.payment': 'Payment', 'orders.status': 'Status', 'orders.placed': 'Placed', 'orders.none': 'No orders',
  'orders.paid': 'Paid', 'orders.unpaid': 'Unpaid', 'orders.zone': 'Zone', 'orders.note': 'Note', 'orders.deliveryFee': 'Delivery fee', 'orders.markPaid': 'Mark as paid',
  'status.pending': 'Pending', 'status.confirmed': 'Confirmed', 'status.processing': 'Processing', 'status.shipped': 'Shipped', 'status.delivered': 'Delivered', 'status.cancelled': 'Cancelled',
  'act.confirmed': 'Confirm order', 'act.processing': 'Start processing', 'act.shipped': 'Hand to courier', 'act.delivered': 'Mark delivered', 'act.cancelled': 'Cancel order',
  'store.title': 'Store details', 'store.hint': 'Changes can take up to a minute to appear on the website.',
  'store.store_name': 'Store name', 'store.tagline': 'Tagline', 'store.phone': 'Phone', 'store.whatsapp': 'WhatsApp', 'store.email': 'Email', 'store.address': 'Address',
  'store.hours_text': 'Opening hours', 'store.drug_license': 'Drug licence no.', 'store.pharmacist_name': 'Pharmacist name', 'store.pharmacist_reg': 'Pharmacist registration no.',
  'store.facebook_url': 'Facebook page', 'store.announcement': 'Top bar announcement', 'store.announcement.hint': 'Shown at the very top of the website',
  'delivery.title': 'Delivery zones', 'delivery.add': 'Add zone', 'delivery.note': 'Customers pick a zone at checkout. A zone used by orders cannot be deleted; switch it off instead.',
  'delivery.code': 'Code', 'delivery.code.hint': 'Lowercase letters, digits, - or _. Cannot change later', 'delivery.name': 'Zone name', 'delivery.fee': 'Fee (৳)',
  'delivery.freeOver': 'Free over (৳)', 'delivery.freeOver.hint': 'Orders above this ship free. Leave empty for never free', 'delivery.eta': 'Delivery time', 'delivery.sort': 'Order',
  'pay.title': 'Payment methods', 'pay.name': 'Name', 'pay.instructions': 'Instructions (shown to customer)', 'pay.enabled': 'Enabled', 'pay.hint': 'bKash and Nagad cannot be enabled until the gateway is connected',
  'cat.title': 'Categories', 'cat.add': 'Add category', 'cat.note': 'A category that has products cannot be deleted.', 'cat.nameBn': 'Name (Bangla)', 'cat.nameEn': 'Name (English)',
  'cat.slug': 'Slug', 'cat.slug.hint': 'Leave empty to generate from the English name', 'cat.icon': 'Icon (emoji)', 'cat.products': 'Products', 'cat.sort': 'Order',
  'co.title': 'Companies', 'co.add': 'Add company', 'co.name': 'Company name', 'co.products': 'Products',
  'staff.title': 'Users & roles', 'staff.add': 'Add user', 'staff.note': 'Admin: everything · Pharmacist: view and update orders · Cashier: view orders',
  'staff.email': 'Email', 'staff.name': 'Name', 'staff.role': 'Role', 'staff.password': 'Password', 'staff.password.hint': 'At least 10 characters', 'staff.password.keep': 'Leave empty to keep current',
  'staff.active': 'Active', 'staff.lastLogin': 'Last sign-in',
  'audit.title': 'Audit log', 'audit.time': 'Time', 'audit.who': 'Who', 'audit.action': 'Action', 'audit.detail': 'Detail',
  'err.invalid_credentials': 'Wrong email or password', 'err.too_many_attempts': 'Too many attempts. Try again in 15 minutes',
  'err.duplicate_code': 'That code already exists', 'err.duplicate_slug': 'That slug already exists', 'err.duplicate_name': 'That name already exists', 'err.duplicate_email': 'That email already exists',
  'err.forbidden': 'You do not have permission for this', 'err.invalid_request': 'Some fields are invalid', 'err.invalid_transition': 'That status change is not allowed',
  'err.in_use': 'In use by {n} record(s) and cannot be deleted. Switch it off or move the records first', 'err.last_zone': 'At least one active zone is required',
  'err.last_method': 'At least one payment method must stay on', 'err.gateway_not_available': 'The bKash/Nagad gateway is not connected yet',
  'err.self_lockout': 'You cannot remove your own admin access', 'err.self_delete': 'You cannot delete yourself', 'err.unauthenticated': 'Please sign in again',
  'err.network': 'Cannot reach the server', 'err.error': 'Something went wrong',
} as const;

export type Key = keyof typeof EN;

const BN: Record<Key, string> = {
  'app.name': 'ফার্মেসি', 'app.admin': 'অ্যাডমিন কনসোল',
  'nav.dashboard': 'ড্যাশবোর্ড', 'nav.orders': 'অর্ডার', 'nav.store': 'দোকানের তথ্য', 'nav.delivery': 'ডেলিভারি', 'nav.payment': 'পেমেন্ট',
  'nav.categories': 'ক্যাটাগরি', 'nav.companies': 'কোম্পানি', 'nav.staff': 'ইউজার', 'nav.audit': 'অডিট লগ',
  'grp.sales': 'বিক্রয়', 'grp.catalog': 'ক্যাটালগ', 'grp.settings': 'সেটিংস', 'grp.system': 'সিস্টেম',
  'common.add': 'যোগ', 'common.edit': 'এডিট', 'common.delete': 'মুছুন', 'common.save': 'সংরক্ষণ', 'common.cancel': 'বাতিল', 'common.close': 'বন্ধ',
  'common.search': 'খুঁজুন…', 'common.empty': 'কিছু নেই', 'common.saved': 'সংরক্ষিত', 'common.deleted': 'মুছে ফেলা হয়েছে', 'common.loading': 'লোড হচ্ছে…',
  'common.confirmDelete': 'মুছে ফেলতে চান?', 'common.on': 'চালু', 'common.off': 'বন্ধ', 'common.active': 'সক্রিয়', 'common.inactive': 'নিষ্ক্রিয়',
  'common.rows': 'টি', 'common.logout': 'লগআউট', 'common.all': 'সব', 'common.optional': 'ঐচ্ছিক',
  'login.title': 'লগইন', 'login.sub': 'ফার্মেসি অ্যাডমিন কনসোল', 'login.email': 'ইমেইল', 'login.password': 'পাসওয়ার্ড', 'login.submit': 'লগইন',
  'role.admin': 'অ্যাডমিন', 'role.pharmacist': 'ফার্মাসিস্ট', 'role.cashier': 'ক্যাশিয়ার',
  'dash.title': 'সারসংক্ষেপ', 'dash.salesToday': 'আজকের বিক্রি', 'dash.ordersToday': 'আজকের অর্ডার', 'dash.pending': 'অপেক্ষমাণ', 'dash.toShip': 'পাঠাতে হবে',
  'dash.lowStock': 'স্টক কম', 'dash.expiring': 'মেয়াদ শেষ হচ্ছে', 'dash.lowStockHint': '{n} বা কম স্টকের ভ্যারিয়েন্ট', 'dash.expiringHint': '{n} দিনের মধ্যে ব্যাচ',
  'dash.recent': 'সাম্প্রতিক অর্ডার', 'dash.viewAll': 'সব দেখুন',
  'orders.title': 'অর্ডার', 'orders.search': 'নম্বর, ফোন বা নাম', 'orders.order': 'অর্ডার', 'orders.customer': 'গ্রাহক', 'orders.total': 'মোট',
  'orders.payment': 'পেমেন্ট', 'orders.status': 'অবস্থা', 'orders.placed': 'সময়', 'orders.none': 'কোনো অর্ডার নেই',
  'orders.paid': 'পরিশোধিত', 'orders.unpaid': 'বাকি', 'orders.zone': 'এলাকা', 'orders.note': 'নোট', 'orders.deliveryFee': 'ডেলিভারি চার্জ', 'orders.markPaid': 'পেমেন্ট পেয়েছি',
  'status.pending': 'অপেক্ষমাণ', 'status.confirmed': 'নিশ্চিত', 'status.processing': 'প্রস্তুত হচ্ছে', 'status.shipped': 'পথে আছে', 'status.delivered': 'পৌঁছেছে', 'status.cancelled': 'বাতিল',
  'act.confirmed': 'নিশ্চিত করুন', 'act.processing': 'প্রস্তুত শুরু', 'act.shipped': 'কুরিয়ারে দিন', 'act.delivered': 'ডেলিভারি সম্পন্ন', 'act.cancelled': 'অর্ডার বাতিল',
  'store.title': 'দোকানের তথ্য', 'store.hint': 'ওয়েবসাইটে আসতে সর্বোচ্চ ১ মিনিট লাগতে পারে।',
  'store.store_name': 'দোকানের নাম', 'store.tagline': 'ট্যাগলাইন', 'store.phone': 'ফোন নম্বর', 'store.whatsapp': 'WhatsApp', 'store.email': 'ইমেইল', 'store.address': 'ঠিকানা',
  'store.hours_text': 'সেবার সময়', 'store.drug_license': 'ড্রাগ লাইসেন্স নম্বর', 'store.pharmacist_name': 'ফার্মাসিস্টের নাম', 'store.pharmacist_reg': 'ফার্মাসিস্ট রেজিস্ট্রেশন নম্বর',
  'store.facebook_url': 'Facebook পেজ', 'store.announcement': 'টপ বারের ঘোষণা', 'store.announcement.hint': 'ওয়েবসাইটের একদম উপরে দেখাবে',
  'delivery.title': 'ডেলিভারি এলাকা', 'delivery.add': 'এলাকা যোগ', 'delivery.note': 'চেকআউটে গ্রাহক এখান থেকে এলাকা বাছেন। অর্ডারে ব্যবহৃত এলাকা মোছা যায় না, বন্ধ করে দিন।',
  'delivery.code': 'কোড', 'delivery.code.hint': 'ইংরেজি ছোট হাতের অক্ষর, সংখ্যা, - বা _। পরে বদলানো যায় না', 'delivery.name': 'এলাকার নাম', 'delivery.fee': 'চার্জ (৳)',
  'delivery.freeOver': 'ফ্রি সীমা (৳)', 'delivery.freeOver.hint': 'এর বেশি অর্ডারে ফ্রি। ফাঁকা মানে কখনো ফ্রি নয়', 'delivery.eta': 'সময়', 'delivery.sort': 'ক্রম',
  'pay.title': 'পেমেন্ট পদ্ধতি', 'pay.name': 'নাম', 'pay.instructions': 'নির্দেশনা (গ্রাহক দেখবে)', 'pay.enabled': 'চালু', 'pay.hint': 'গেটওয়ে যুক্ত না হওয়া পর্যন্ত bKash/Nagad চালু করা যায় না',
  'cat.title': 'ক্যাটাগরি', 'cat.add': 'ক্যাটাগরি যোগ', 'cat.note': 'পণ্য আছে এমন ক্যাটাগরি মোছা যায় না।', 'cat.nameBn': 'নাম (বাংলা)', 'cat.nameEn': 'নাম (ইংরেজি)',
  'cat.slug': 'স্লাগ', 'cat.slug.hint': 'খালি রাখলে ইংরেজি নাম থেকে তৈরি হবে', 'cat.icon': 'আইকন (ইমোজি)', 'cat.products': 'পণ্য', 'cat.sort': 'ক্রম',
  'co.title': 'কোম্পানি', 'co.add': 'কোম্পানি যোগ', 'co.name': 'কোম্পানির নাম', 'co.products': 'পণ্য',
  'staff.title': 'ইউজার ও ভূমিকা', 'staff.add': 'ইউজার যোগ', 'staff.note': 'অ্যাডমিন: সব কিছু · ফার্মাসিস্ট: অর্ডার দেখা ও আপডেট · ক্যাশিয়ার: অর্ডার দেখা',
  'staff.email': 'ইমেইল', 'staff.name': 'নাম', 'staff.role': 'ভূমিকা', 'staff.password': 'পাসওয়ার্ড', 'staff.password.hint': 'কমপক্ষে ১০ অক্ষর', 'staff.password.keep': 'বদলাতে না চাইলে ফাঁকা রাখুন',
  'staff.active': 'সক্রিয়', 'staff.lastLogin': 'শেষ লগইন',
  'audit.title': 'অডিট লগ', 'audit.time': 'সময়', 'audit.who': 'কে', 'audit.action': 'কাজ', 'audit.detail': 'বিস্তারিত',
  'err.invalid_credentials': 'ইমেইল বা পাসওয়ার্ড ভুল', 'err.too_many_attempts': 'অনেকবার ভুল হয়েছে। ১৫ মিনিট পরে চেষ্টা করুন',
  'err.duplicate_code': 'এই কোড আগেই আছে', 'err.duplicate_slug': 'এই স্লাগ আগেই আছে', 'err.duplicate_name': 'এই নাম আগেই আছে', 'err.duplicate_email': 'এই ইমেইল আগেই আছে',
  'err.forbidden': 'এই কাজের অনুমতি আপনার নেই', 'err.invalid_request': 'কিছু তথ্য সঠিক নয়', 'err.invalid_transition': 'এই অবস্থায় যাওয়া যায় না',
  'err.in_use': '{n}টি রেকর্ডে ব্যবহৃত, মোছা যাবে না। বন্ধ করুন বা রেকর্ডগুলো সরান', 'err.last_zone': 'অন্তত একটি সক্রিয় এলাকা থাকতে হবে',
  'err.last_method': 'অন্তত একটি পেমেন্ট পদ্ধতি চালু থাকতে হবে', 'err.gateway_not_available': 'bKash/Nagad গেটওয়ে এখনো যুক্ত হয়নি',
  'err.self_lockout': 'নিজের অ্যাডমিন অ্যাক্সেস বন্ধ করা যাবে না', 'err.self_delete': 'নিজেকে মুছা যাবে না', 'err.unauthenticated': 'আবার লগইন করুন',
  'err.network': 'সার্ভারের সাথে সংযোগ হয়নি', 'err.error': 'কিছু একটা সমস্যা হয়েছে',
};

const DICT = { en: EN as Record<Key, string>, bn: BN };
const KEY = 'medshop.admin.lang';

function initial(): Lang {
  try { const v = localStorage.getItem(KEY); if (v === 'en' || v === 'bn') return v; } catch { /* storage blocked */ }
  return 'en'; // English is the default
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: Key, vars?: Record<string, string | number>) => string };
const C = createContext<Ctx>(null as never);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, set] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => { set(l); try { localStorage.setItem(KEY, l); } catch { /* ignore */ } document.documentElement.lang = l; }, []);
  const value = useMemo<Ctx>(() => ({
    lang, setLang,
    t: (k, vars) => (DICT[lang][k] ?? EN[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => String(vars?.[n] ?? '')),
  }), [lang, setLang]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
export const useT = () => useContext(C);
