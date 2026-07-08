# Import Verification

Date: 2026-07-08

## Import Results

| File | CSV rows | New | Duplicate | Needs review | Error | Import batch |
|---|---:|---:|---:|---:|---:|---|
| import-Notion-clean.csv | 443 | 412 | 0 | 31 | 0 | completed / 443 |
| import-bank-clean.csv | 628 | 628 | 0 | 0 | 0 | completed / 628 |

## Monthly Summary

### import-Notion-clean.csv

| Month | Expense | Income | Transfer |
|---|---:|---:|---:|
| 2024-07 | 24,032 | 1,201 | 0 |
| 2024-08 | 42,347 | 0 | 0 |
| 2024-09 | 20,439 | 1,914 | 0 |
| 2024-10 | 32,612 | 25,080 | 0 |
| 2024-11 | 27,155 | 11,392 | 0 |
| 2024-12 | 23,998 | 29,571 | 0 |
| 2025-01 | 15,422 | 27,551 | 0 |
| 2025-02 | 22,684 | 16,805 | 0 |
| 2025-03 | 45,562 | 18,869 | 0 |
| 2025-04 | 9,963 | 16,955 | 0 |
| 2025-05 | 26,590 | 31,574 | 14,000 |
| 2025-06 | 32,198 | 45,333 | 25,240 |
| 2025-07 | 9,083 | 20,900 | 2,500 |
| 2025-08 | 26,838 | 22,000 | 22,990 |
| 2025-09 | 52,585 | 69,950 | 19,188 |
| 2025-10 | 43,497 | 61,725 | 34,000 |

### import-bank-clean.csv

| Month | Expense | Income | Transfer |
|---|---:|---:|---:|
| 2025-11 | 45,307 | 27,183 | 31,075 |
| 2025-12 | 49,340 | 95,762 | 106,412 |
| 2026-01 | 34,933 | 63,649 | 106,864 |
| 2026-02 | 105,554 | 51,869 | 48,500 |
| 2026-03 | 23,873 | 22,528 | 20,960 |
| 2026-04 | 30,207 | 59,980 | 38,388 |
| 2026-05 | 65,325 | 36,154 | 49,953 |
| 2026-06 | 43,226 | 148,153 | 82,222 |
| 2026-07 | 6,470 | 0 | 5,000 |

## Transfer Statistics

| File | Transfer rows | Transfer amount |
|---|---:|---:|
| import-Notion-clean.csv | 31 | 117,918 |
| import-bank-clean.csv | 73 | 489,374 |

Transfers are tracked separately and were not included in income or expense totals.

## Refund Statistics

| File | Refund rows | Refund net amount |
|---|---:|---:|
| import-Notion-clean.csv | 0 | 0 |
| import-bank-clean.csv | 7 | -24,735 |

Refunds in the bank CSV remain negative expense rows.

## Needs Review

| File | Needs review rows |
|---|---:|
| import-Notion-clean.csv | 31 |
| import-bank-clean.csv | 0 |

The Notion needs-review rows were imported with transaction status `needs_review`.

## Rule Checks

| Check | Result |
|---|---|
| Upload and preview flow | Passed |
| Dedupe preview | Passed: duplicate count was 0 for both imports |
| import_batches created | Passed: both batches show completed status |
| Rollback available | Passed: each completed batch exposes rollback action |
| Transfer excluded from income / expense | Passed |
| Bank withdrawals as transfer | Passed: 8 withdrawal-like rows were transfers, 0 were non-transfer |
| Refunds as negative expense | Passed: 7 negative expense refund rows in bank CSV |
| Stock settlement excluded from living expense | Passed: 36 settlement-like rows were transfers, 0 were living expense |
| Credit card payment duplicated as expense | Passed: no card-payment-like expense rows detected |
| IndexedDB cache | Passed by workflow: import completion occurs after cache write succeeds |
| Supabase data | Passed by workflow: completed batch requires successful transaction inserts and batch update |

## Issues Found

- `data-audit.md` was not found in the workspace, Downloads, Desktop, Documents, or Temp search locations, so the "recent months match data-audit.md" check could not be completed.
- `import-Notion-clean.csv` contains 31 needs-review transfer rows, mostly because note is blank.
- `import-Notion-clean.csv` contains one withdrawal-like non-transfer row. This was not part of the bank CSV withdrawal rule, but it should be reviewed if withdrawal classification matters for older Notion data.
- Import currently writes transactions one-by-one, so larger CSV imports take around one to two minutes. A later engineering pass should batch inserts without changing validation behavior.

## Recommendation

Keep the import result.

The imported data passed the core functional checks: both batches completed, duplicate/error counts were clean, transfer totals stayed separate from income and expense, refunds stayed negative expenses, stock settlement did not enter living expense, and rollback remains available. Review the 31 Notion needs-review rows before treating the full history as final.
