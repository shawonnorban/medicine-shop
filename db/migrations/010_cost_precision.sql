-- Cost per base unit (e.g. a strip price divided by 10) needs more than two decimals.
ALTER TABLE batches ALTER COLUMN cost_price TYPE numeric(14,4);
