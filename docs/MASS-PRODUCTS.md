# Products in Excel

Open **Products in Excel** in the staff sidebar. Download existing products plus a template, or a blank template for new products. Both use the same import workflow.

The workbook contains Products, Categories, Column Guide, Examples and Instructions sheets. Only Products is imported. The Action column uses automatic formulas backed by a hidden original-values sheet. Excel dropdowns offer current category names, fixed/from/quote, and Yes/No. Header notes explain fields; IDs and versions are shaded as system values.

- Start entering a new row and Action shows **Add** automatically. Clicking an empty cell alone does not change it; no macros are required. Leave Product ID and Version blank to generate a unique ID during review.
- Editing existing values changes Action to **Update** automatically. Keep Category, Product ID and Version unchanged.
- Unchanged existing rows display **Skip**. Import ignores the Action label and its cached formula result: product identity, version and actual field differences determine additions, updates and skipped rows. Blank rows remain blank. The backend also ignores no-op updates.
- Keep Action formulas intact for live Excel labels. Only that automatic column can contain formulas; product fields must contain values. Download a fresh template to get the formulas; older files still import with automatic action detection.
- Blank editable cells keep existing values. Omitting rows does not delete products.
- Select photos separately and match Image Filename. Blank Image Filename on Update keeps the current photo. Photos upload only after confirmation.
- Up to 250 rows across 20 changed categories per batch; each category can contain 250 products. Export a category or remove untouched rows if a combined file would exceed the batch limit.
- The Worker validates data and versions, merges additions and edits without removing unrelated products, and publishes changed category files together in one non-forced Git commit.
- Image uploads precede the product commit. Interrupted batches may leave unused image files; reload and review before retrying. Product changes are atomic.
- PWP/promotion settings, category visibility, galleries and unsupported fields are preserved.

ExcelJS 4.4.0 generates the formatted workbook and validation lists (MIT license in admin/vendor/EXCELJS-LICENSE.txt). SheetJS CE 0.20.3 reads workbooks in a disposable worker with row/column limits and a 15-second timeout (Apache-2.0 license in admin/vendor/SHEETJS-LICENSE.txt). Both libraries are vendored locally; spreadsheets are not sent to a third-party service.
