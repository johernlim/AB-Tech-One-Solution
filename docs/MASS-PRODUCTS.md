# Mass Upload and Mass Edit

Open **Mass Upload / Edit** in the staff sidebar. Download the Excel template to add products, or export existing products for editing. Templates include Products, Categories and Instructions sheets.

- Up to 250 rows across 20 categories per batch; existing 250-products-per-category limit still applies.
- Select photos separately and match the Image Filename column. Photos are validated locally and uploaded only after Confirm & publish.
- Mass Edit matches Category ID + Product ID. Neither identifier may be changed. Blank editable cells preserve current values. Omitted rows do not delete products. Version protects against stale exports.
- Review shows every changed field. Errors block the whole batch. Unchanged rows are skipped.
- The Worker revalidates products and category/product versions, then creates one Git tree/commit and advances main without force. A concurrent edit blocks publishing instead of overwriting it.
- Image uploads happen before the product commit. If publishing fails, uploaded images can remain unused; live products are not partially updated. Reload and review before retrying an interrupted publish.
- Existing gallery, legacy flags and fields not supported by the spreadsheet remain intact. PWP/promotion references and category visibility are not edited by this tool.

The browser uses vendored SheetJS CE 0.20.3 from https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js under Apache-2.0. License: admin/vendor/SHEETJS-LICENSE.txt. Workbooks are parsed in a disposable worker with a 15-second timeout and bounded row/column limits. The feature generates its templates at runtime; it does not send spreadsheets to an external service.
