/**
 * Configurable Excel column → database field mapping for product import.
 * Header matching is case-insensitive with whitespace removed.
 * Unknown columns are ignored. Duplicate header labels use `occurrence` (1-based).
 */

export const PRODUCT_IMPORT_TABLES = {
  PRODUCTS: 'products',
  MASTER: 'product_master',
  INVENTORY: 'product_inventory',
  PRICING: 'product_pricing',
  TAG: 'product_tag_details',
};

/** @type {import('../utils/productImportMapper.js').ColumnMappingEntry[]} */
export const DEFAULT_PRODUCT_IMPORT_MAPPINGS = [
  // ── Product identification (legacy JewelTrack + ERP snake_case export) ──
  { headers: ['TranNo', 'TransactionNumber', 'Transaction No', 'Tran No', 'trans_no', 'TransNo', 'Trans No', 'trans no', 'trasno', 'tras_no', 'tras no', 'LotNo', 'Lot No', 'lot_no', 'lot no'], table: PRODUCT_IMPORT_TABLES.PRODUCTS, field: 'tran_no', type: 'string', required: true },
  { headers: ['TranDate', 'TransactionDate', 'Transaction Date', 'Tran Date', 'trans_date', 'TransDate', 'Trans Date', 'trans date', 'Stock Date', 'stock_date', 'stock date', 'TagAddDate', 'Tag Add Date', 'tag_add_date', 'tag add date'], table: PRODUCT_IMPORT_TABLES.PRODUCTS, field: 'tran_date', type: 'date' },
  { headers: ['Tag/PacketNo', 'TagPacketNo', 'Tag No', 'TagNo', 'Tag Number', 'TagNumber', 'tag_no', 'tag no', 'tag_number'], table: PRODUCT_IMPORT_TABLES.PRODUCTS, field: 'tag_packet_no', type: 'string' },
  { headers: ['Tag/PacketNo', 'TagPacketNo', 'Tag No', 'TagNo', 'Tag Number', 'TagNumber', 'tag_no', 'tag no', 'tag_number'], table: PRODUCT_IMPORT_TABLES.TAG, field: 'tag_no', type: 'string' },
  { headers: ['Barcode', 'Bar Code', 'BarCode'], table: PRODUCT_IMPORT_TABLES.TAG, field: 'barcode', type: 'string' },
  { headers: ['RFID', 'Rfid'], table: PRODUCT_IMPORT_TABLES.TAG, field: 'rfid', type: 'string' },
  { headers: ['QRCode', 'QR Code', 'QrCode'], table: PRODUCT_IMPORT_TABLES.TAG, field: 'qr_code', type: 'string' },
  { headers: ['LotNumber', 'Lot Number', 'Lot No', 'LotNo', 'Bag Number', 'Bag No', 'bag_number', 'bag no'], table: PRODUCT_IMPORT_TABLES.INVENTORY, field: 'lot_number', type: 'string' },
  { headers: ['ProductCode', 'Product Code', 'SKU', 'ItemCode', 'Item Code'], table: PRODUCT_IMPORT_TABLES.MASTER, field: 'product_code', type: 'string' },
  { headers: ['ProCode', 'Pro Code', 'pro_code', 'pro code', 'ProductCodeId', 'Product Code Id'], table: PRODUCT_IMPORT_TABLES.MASTER, field: 'erp_pro_code', type: 'integer' },
  { headers: ['TagType', 'Tag Type', 'tag_type', 'tag type'], table: PRODUCT_IMPORT_TABLES.PRODUCTS, field: 'tag_type', type: 'string' },

  // ── Product information ──
  { headers: ['Category'], table: PRODUCT_IMPORT_TABLES.MASTER, field: 'category', type: 'string' },
  { headers: ['Product', 'Item Name', 'ItemName', 'item_name', 'item name'], table: PRODUCT_IMPORT_TABLES.PRODUCTS, field: 'product', type: 'string', required: true },
  { headers: ['SubProduct', 'Sub Product', 'sub_product', 'sub product'], table: PRODUCT_IMPORT_TABLES.PRODUCTS, field: 'sub_product', type: 'string', requiredColumn: true },
  { headers: ['ProductDesign', 'Product Design', 'Design'], table: PRODUCT_IMPORT_TABLES.MASTER, field: 'product_design', type: 'string' },
  { headers: ['Collection'], table: PRODUCT_IMPORT_TABLES.MASTER, field: 'collection_name', type: 'string' },
  { headers: ['Brand'], table: PRODUCT_IMPORT_TABLES.MASTER, field: 'brand', type: 'string' },
  { headers: ['Gender'], table: PRODUCT_IMPORT_TABLES.MASTER, field: 'gender', type: 'string' },
  { headers: ['Occasion'], table: PRODUCT_IMPORT_TABLES.MASTER, field: 'occasion', type: 'string' },

  // ── Metal information ──
  { headers: ['Metal', 'metal_type', 'Metal Type', 'metal type', 'Material', 'material'], table: PRODUCT_IMPORT_TABLES.MASTER, field: 'metal', type: 'string' },
  { headers: ['Purity', 'Purity Name', 'purity_name', 'purity name'], table: PRODUCT_IMPORT_TABLES.MASTER, field: 'purity', type: 'string' },
  { headers: ['HSNCode', 'HSN Code', 'HSN', 'hsn_code', 'hsn code'], table: PRODUCT_IMPORT_TABLES.MASTER, field: 'hsn_code', type: 'string' },
  { headers: ['UOM', 'Unit', 'UnitOfMeasure', 'Unit Of Measure', 'Units', 'units'], table: PRODUCT_IMPORT_TABLES.MASTER, field: 'uom', type: 'string' },

  // ── Weight (legacy products + extended pricing) ──
  { headers: ['GrossWt', 'Gross Wt', 'GrossWeight', 'Gross Weight', 'gross_weight', 'gross weight', 'Weight', 'weight', 'Tag Weight', 'Tag Wt', 'tag_weight', 'tag wt', 'GrsWt', 'Grs Wt', 'grs_wt', 'grs wt'], table: PRODUCT_IMPORT_TABLES.PRODUCTS, field: 'gross_wt', type: 'decimal' },
  { headers: ['NetWt', 'Net Wt', 'NetWeight', 'Net Weight', 'net_weight', 'net weight', 'Pure Weight', 'pure_weight', 'pure weight', 'Metal Weight', 'Metal Wt', 'metal_weight', 'metal wt'], table: PRODUCT_IMPORT_TABLES.PRODUCTS, field: 'net_wt', type: 'decimal' },
  { headers: ['LessWeight', 'Less Wt', 'Less Weight', 'LessWt', 'less_wt', 'less wt'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'less_weight', type: 'decimal' },
  { headers: ['ThreadWeight', 'Thread Wt', 'Thread Weight'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'thread_weight', type: 'decimal' },
  { headers: ['SupplierDeductionWeight', 'Supplier Deduction Weight', 'SupplierDeductionWt'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'supplier_deduction_weight', type: 'decimal' },
  { headers: ['StoneWeight', 'Stone Wt', 'Stone Weight', 'stone_weight', 'stone weight'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'stone_weight', type: 'decimal' },
  { headers: ['DiamondWeight', 'Diamond Wt', 'Diamond Weight', 'Diamond Wt', 'diamond_wt', 'diamond wt'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'diamond_weight', type: 'decimal' },
  { headers: ['OtherMetalWeight', 'Other Metal Weight', 'OtherMetalWt'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'other_metal_weight', type: 'decimal' },
  { headers: ['Weight(Gram)', 'Weight (Gram)', 'WeightGram', 'Weight Gram', 'stone_weight_gm', 'stone weight gm', 'weight_gram', 'weight gram'], table: PRODUCT_IMPORT_TABLES.PRODUCTS, field: 'weight_gram', type: 'decimal', occurrence: 1 },
  { headers: ['Weight(Carat)', 'Weight (Carat)', 'WeightCarat', 'Weight Carat', 'stone_weight_ct', 'stone weight ct', 'weight_carat', 'weight carat'], table: PRODUCT_IMPORT_TABLES.PRODUCTS, field: 'weight_carat', type: 'decimal', occurrence: 1 },

  // ── Quantity ──
  { headers: ['Pieces', 'Qty', 'qty', 'QTY', 'Quantity', 'quantity', 'Pcs', 'PCS', 'pcs'], table: PRODUCT_IMPORT_TABLES.PRODUCTS, field: 'pieces', type: 'integer', occurrence: 1 },
  { headers: ['Pieces'], table: PRODUCT_IMPORT_TABLES.PRODUCTS, field: 'item_pieces', type: 'integer', occurrence: 2 },
  { headers: ['StonePieces', 'Stone Pieces', 'stone_pieces', 'stone pieces'], table: PRODUCT_IMPORT_TABLES.PRODUCTS, field: 'item_pieces', type: 'integer' },
  { headers: ['DiamondPieces', 'Diamond Pieces'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'diamond_pieces', type: 'integer' },

  // ── Pricing ──
  { headers: ['GoldRate', 'Gold Rate', 'G.Rate', 'G Rate', 'GRate', 'g_rate', 'g rate', 'grate'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'gold_rate', type: 'decimal' },
  // MaxMc / MC → making charge (JewelTrack tag print field)
  { headers: ['MakingCharge', 'Making Charge', 'Making Charges', 'making_charges', 'making charges', 'MC', 'M.C.', 'M/C', 'mc', 'MaxMC', 'Max Mc', 'Max MC', 'max_mc', 'max mc', 'MaxMakingCharge', 'Max Making Charge'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'making_charge', type: 'decimal' },
  { headers: ['MaxMC', 'Max MC', 'Max Mc', 'max_mc', 'max mc', 'MaxMakingCharge', 'Max Making Charge'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'max_mc', type: 'decimal' },
  { headers: ['MakingChargeType', 'Making Charge Type', 'making_charge_type', 'making charge type'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'making_charge_type', type: 'string' },
  // MaxWasPerGrm → wastage %; MaxWastage → wastage amount (separate Excel columns)
  { headers: ['MaxWasPerGrm', 'Max Was Per Grm', 'MaxWasPerGrn', 'Max Was Per Grn', 'max_was_per_grm', 'max was per grm', 'max_was_per_grn', 'max was per grn', 'WasPerGrm', 'Was Per Grm', 'Wastage%', 'Wastage %', 'WastagePercent', 'Wastage Percent'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'wastage_percentage', type: 'decimal' },
  { headers: ['MaxWastage', 'Max Wastage', 'max_wastage', 'max wastage', 'WastageAmount', 'Wastage Amount', 'Wastage'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'wastage_amount', type: 'decimal' },
  { headers: ['StoneAmount', 'Stone Amount'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'stone_amount', type: 'decimal' },
  { headers: ['DiamondAmount', 'Diamond Amount'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'diamond_amount', type: 'decimal' },
  { headers: ['LabourCharge', 'Labour Charge', 'LaborCharge', 'Labor Charge'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'labour_charge', type: 'decimal' },
  { headers: ['PurchaseCost', 'Purchase Cost', 'CostPrice', 'Cost Price', 'purchase_rate', 'purchase rate', 'purchase_cost', 'Cost', 'cost'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'purchase_cost', type: 'decimal' },
  { headers: ['SellingPrice', 'Selling Price', 'SalePrice', 'Sale Price', 'MRP', 'selling_price', 'selling price', 'Price', 'price', 'Amount', 'Amt', 'TotalAmount', 'Total Amount', 'NetAmt', 'Net Amt', 'Net Value', 'net_value', 'net value', 'Total Value', 'total_value', 'total value'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'selling_price', type: 'decimal' },
  { headers: ['GSTPercentage', 'GST Percentage', 'GSTPercent', 'GST %', 'Tax %', 'tax %', 'tax_pct', 'TaxPct'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'gst_percentage', type: 'decimal' },
  { headers: ['GSTAmount', 'GST Amount'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'gst_amount', type: 'decimal' },
  { headers: ['SaleValue', 'Sale Value', 'sale_value', 'sale value'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'sale_value', type: 'decimal' },
  { headers: ['Rate'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'rate', type: 'decimal' },
  { headers: ['RateId', 'Rate ID', 'Rate Id', 'rate_id', 'rate id'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'rate_id', type: 'decimal' },
  { headers: ['PerPcsValue', 'Per Pcs Value', 'PerPcs Value', 'per_pcs_value', 'per pcs value'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'per_pcs_value', type: 'decimal' },
  { headers: ['PerGramValue', 'Per Gram Value', 'PerGram Value', 'per_gram_value', 'per gram value'], table: PRODUCT_IMPORT_TABLES.PRICING, field: 'per_gram_value', type: 'decimal' },

  // ── Inventory ──
  { headers: ['Company'], table: PRODUCT_IMPORT_TABLES.INVENTORY, field: 'company', type: 'string' },
  { headers: ['Branch'], table: PRODUCT_IMPORT_TABLES.INVENTORY, field: 'branch_name', type: 'string' },
  { headers: ['Warehouse'], table: PRODUCT_IMPORT_TABLES.INVENTORY, field: 'warehouse', type: 'string' },
  { headers: ['Location'], table: PRODUCT_IMPORT_TABLES.INVENTORY, field: 'location', type: 'string' },
  { headers: ['Counter', 'Center', 'Centre', 'Location', 'Warehouse', 'warehouse'], table: PRODUCT_IMPORT_TABLES.PRODUCTS, field: 'counter_name', type: 'string' },
  { headers: ['StockStatus', 'Stock Status', 'Status', 'status'], table: PRODUCT_IMPORT_TABLES.INVENTORY, field: 'stock_status', type: 'string' },
  { headers: ['Size', 'size'], table: PRODUCT_IMPORT_TABLES.PRODUCTS, field: 'size', type: 'string' },

  // ── Supplier ──
  { headers: ['Supplier', 'Vendor', 'vendor'], table: PRODUCT_IMPORT_TABLES.INVENTORY, field: 'supplier', type: 'string' },
  { headers: ['SupplierInvoiceNumber', 'Supplier Invoice Number', 'SupplierInvoiceNo', 'InvoiceNo', 'Invoice No', 'Bill No', 'bill_no', 'bill no'], table: PRODUCT_IMPORT_TABLES.INVENTORY, field: 'supplier_invoice_number', type: 'string' },
  { headers: ['PurchaseDate', 'Purchase Date'], table: PRODUCT_IMPORT_TABLES.INVENTORY, field: 'purchase_date', type: 'date' },

  // ── Additional ──
  { headers: ['Description'], table: PRODUCT_IMPORT_TABLES.MASTER, field: 'description', type: 'string' },
  { headers: ['Remarks', 'Remark'], table: PRODUCT_IMPORT_TABLES.MASTER, field: 'remarks', type: 'string' },
  { headers: ['CertificationNumber', 'Certification Number', 'CertificateNo', 'Certificate No', 'certificate_no', 'certificate no', 'certification'], table: PRODUCT_IMPORT_TABLES.MASTER, field: 'certification_number', type: 'string' },
  { headers: ['HallmarkNumber', 'Hallmark Number', 'HallmarkNo', 'Hallmark No'], table: PRODUCT_IMPORT_TABLES.MASTER, field: 'hallmark_number', type: 'string' },
  { headers: ['ImageURL', 'Image URL', 'ImageUrl', 'Image'], table: PRODUCT_IMPORT_TABLES.MASTER, field: 'image_url', type: 'string' },
];

/** Columns that must exist in the Excel header row */
export const REQUIRED_HEADER_FIELDS = ['product', 'tag_packet_no'];

/** At least one of these must exist to identify the stock row anchor */
export const HEADER_ANCHOR_FIELDS = ['tran_no', 'tag_packet_no'];

/** Fields used for duplicate detection within an import file */
export const DUPLICATE_TRACKING_FIELDS = [
  { table: PRODUCT_IMPORT_TABLES.PRODUCTS, field: 'tag_packet_no', label: 'Tag Number' },
  { table: PRODUCT_IMPORT_TABLES.TAG, field: 'barcode', label: 'Barcode' },
];

export const IMPORT_MODES = {
  INSERT: 'insert',
  UPDATE: 'update',
  UPSERT: 'upsert',
};

export const VALID_IMPORT_MODES = new Set(Object.values(IMPORT_MODES));

export const getProductImportMappings = (customMappings = null) => {
  if (!customMappings || !Array.isArray(customMappings) || customMappings.length === 0) {
    return DEFAULT_PRODUCT_IMPORT_MAPPINGS;
  }

  return customMappings;
};
