/**
 * Standard SQL filter for excluding transfers, refunds, and non-spending transaction classes.
 * Uses belt-and-suspenders approach: category-level `exclude_from_totals` flag
 * AND transaction-level `transaction_class` check. IS NULL for backward compat.
 * Assumes `c` alias for categories and `t` alias for transactions.
 */
export const VALID_TRANSACTION_FILTER = "COALESCE(c.exclude_from_totals, 0) = 0 AND (t.transaction_class IS NULL OR t.transaction_class IN ('purchase', 'fee', 'interest'))"
