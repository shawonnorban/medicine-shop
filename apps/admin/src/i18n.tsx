import { createContext, useContext } from 'react';

const EN = {
  'app.name': 'Pharmacy', 'app.admin': 'Admin Console',
  'nav.dashboard': 'Dashboard', 'nav.products': 'Medicines', 'nav.generics': 'Generic library', 'nav.stock': 'Stock', 'nav.purchases': 'Purchases', 'nav.suppliers': 'Suppliers', 'nav.orders': 'Orders', 'nav.store': 'Store details', 'nav.delivery': 'Delivery', 'nav.payment': 'Payments',
  'nav.categories': 'Categories', 'nav.companies': 'Companies', 'nav.staff': 'Users', 'nav.audit': 'Audit log',
  'grp.sales': 'Sales', 'grp.catalog': 'Catalog', 'grp.settings': 'Settings', 'grp.system': 'System',
  'common.add': 'Add', 'common.edit': 'Edit', 'common.delete': 'Delete', 'common.save': 'Save', 'common.cancel': 'Cancel', 'common.close': 'Close',
  'common.search': 'Search…', 'common.empty': 'Nothing here yet', 'common.saved': 'Saved', 'common.deleted': 'Deleted', 'common.loading': 'Loading…',
  'common.confirmDelete': 'Delete this item?', 'common.on': 'On', 'common.off': 'Off', 'common.active': 'Active', 'common.inactive': 'Inactive',
  'common.rows': 'rows', 'common.logout': 'Sign out', 'common.all': 'All', 'common.optional': 'optional', 'store.hide_out_of_stock': 'Hide out-of-stock medicines on the website', 'store.low_stock_at': 'Low stock at or below', 'store.expiry_warn_days': 'Warn about expiry within (days)',
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
  'err.duplicate_barcode': 'That barcode is already used by another pack', 'err.variant_in_use': 'A pack with stock history or orders cannot be removed',
  'err.product_in_use': 'This medicine has stock or order history. Mark it inactive instead', 'err.already_expired': 'A batch is already expired',
  'err.batch_expiry_mismatch': 'That batch number exists with a different expiry date', 'err.insufficient_stock': 'Not enough stock in that batch',
  'err.qty_must_be_negative': 'Use a negative quantity for this reason', 'err.unsupported_image': 'Use a JPG, PNG or WebP image', 'err.file_too_large': 'Image is larger than 3 MB',
  'err.network': 'Cannot reach the server', 'err.error': 'Something went wrong',
} as const;

export type Key = keyof typeof EN;


/** The admin console is English only. Keys stay so every label lives in one place. */
type Ctx = { t: (k: Key, vars?: Record<string, string | number>) => string };
const C = createContext<Ctx>({ t: (k, vars) => String(EN[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => String(vars?.[n] ?? '')) });

export function I18nProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }
export const useT = () => useContext(C);
