import postgres from 'postgres';

export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://medshop:medshop@localhost:5432/medshop';

export const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  onnotice: () => {},   // TRUNCATE ... CASCADE and similar notices are not errors
  // numeric -> JS number (prices fit comfortably in doubles at 2 decimals)
  types: { numeric: { to: 1700, from: [1700], serialize: (v: number) => String(v), parse: (v: string) => Number(v) } },
});
