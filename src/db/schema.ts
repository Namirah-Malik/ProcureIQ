import {
  pgTable,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  defaultCurrency: text("default_currency").notNull().default("INR"),
  priceTolerancePct: doublePrecision("price_tolerance_pct").notNull().default(1.0),
  quantityToleranceUnits: doublePrecision("quantity_tolerance_units").notNull().default(0),
  ...timestamps,
});

// Credentials-based auth (bcrypt-hashed passwords) using Auth.js JWT sessions.
// JWT sessions avoid a server-side session table, keeping this free-tier friendly
// on serverless hosting (no extra DB round trip per request to look up sessions).
export const users = pgTable("users", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "manager", "analyst", "finance", "warehouse"] })
    .notNull()
    .default("analyst"),
  ...timestamps,
}, (t) => ({
  emailIdx: uniqueIndex("users_email_idx").on(t.email),
}));

export const suppliers = pgTable("suppliers", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  contactName: text("contact_name"),
  ...timestamps,
}, (t) => ({
  codeOrgIdx: uniqueIndex("suppliers_code_org_idx").on(t.orgId, t.code),
}));

export const products = pgTable("products", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  sku: text("sku").notNull(),
  description: text("description").notNull(),
  unitOfMeasure: text("unit_of_measure").notNull().default("EA"),
  ...timestamps,
}, (t) => ({
  skuOrgIdx: uniqueIndex("products_sku_org_idx").on(t.orgId, t.sku),
}));

export const productAliases = pgTable("product_aliases", {
  id: id(),
  productId: uuid("product_id").notNull().references(() => products.id),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  supplierSku: text("supplier_sku"),
  supplierDescription: text("supplier_description"),
  ...timestamps,
});

export const procurementDocuments = pgTable("procurement_documents", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  type: text("type", {
    enum: ["purchase_order", "invoice", "goods_receipt", "quotation", "supporting"],
  }).notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  extractionStatus: text("extraction_status", {
    enum: ["pending", "processing", "needs_review", "complete", "failed"],
  }).notNull().default("pending"),
  validationStatus: text("validation_status", {
    enum: ["unvalidated", "validated", "has_errors"],
  }).notNull().default("unvalidated"),
  reconciliationStatus: text("reconciliation_status", {
    enum: ["not_eligible", "eligible", "reconciled"],
  }).notNull().default("not_eligible"),
  processingError: text("processing_error"),
  supplierId: uuid("supplier_id").references(() => suppliers.id),
  rawExtractedJson: text("raw_extracted_json"),
  ...timestamps,
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  documentId: uuid("document_id").references(() => procurementDocuments.id),
  poNumber: text("po_number").notNull(),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  orderDate: text("order_date").notNull(),
  expectedDeliveryDate: text("expected_delivery_date"),
  currency: text("currency").notNull().default("INR"),
  status: text("status", { enum: ["open", "partially_received", "closed", "cancelled"] })
    .notNull()
    .default("open"),
  ...timestamps,
}, (t) => ({
  poNumOrgIdx: uniqueIndex("po_number_org_idx").on(t.orgId, t.poNumber),
}));

export const purchaseOrderLines = pgTable("purchase_order_lines", {
  id: id(),
  purchaseOrderId: uuid("purchase_order_id").notNull().references(() => purchaseOrders.id),
  lineNumber: integer("line_number").notNull(),
  productId: uuid("product_id").references(() => products.id),
  description: text("description").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  unitOfMeasure: text("unit_of_measure").notNull().default("EA"),
  unitPriceMinor: integer("unit_price_minor").notNull(),
});

export const invoices = pgTable("invoices", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  documentId: uuid("document_id").references(() => procurementDocuments.id),
  invoiceNumber: text("invoice_number").notNull(),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id),
  invoiceDate: text("invoice_date").notNull(),
  currency: text("currency").notNull().default("INR"),
  taxMinor: integer("tax_minor").notNull().default(0),
  freightMinor: integer("freight_minor").notNull().default(0),
  discountMinor: integer("discount_minor").notNull().default(0),
  totalMinor: integer("total_minor").notNull(),
  ...timestamps,
}, (t) => ({
  dupKeyIdx: index("invoices_dup_key_idx").on(t.orgId, t.supplierId, t.invoiceNumber),
}));

export const invoiceLines = pgTable("invoice_lines", {
  id: id(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  lineNumber: integer("line_number").notNull(),
  productId: uuid("product_id").references(() => products.id),
  description: text("description").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  unitOfMeasure: text("unit_of_measure").notNull().default("EA"),
  unitPriceMinor: integer("unit_price_minor").notNull(),
  lineTotalMinor: integer("line_total_minor").notNull(),
});

export const goodsReceipts = pgTable("goods_receipts", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  documentId: uuid("document_id").references(() => procurementDocuments.id),
  grnNumber: text("grn_number").notNull(),
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id),
  receivedDate: text("received_date").notNull(),
  ...timestamps,
});

export const goodsReceiptLines = pgTable("goods_receipt_lines", {
  id: id(),
  goodsReceiptId: uuid("goods_receipt_id").notNull().references(() => goodsReceipts.id),
  lineNumber: integer("line_number").notNull(),
  productId: uuid("product_id").references(() => products.id),
  description: text("description").notNull(),
  receivedQuantity: doublePrecision("received_quantity").notNull(),
  unitOfMeasure: text("unit_of_measure").notNull().default("EA"),
});

export const reconciliationRuns = pgTable("reconciliation_runs", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  initiatedByUserId: uuid("initiated_by_user_id").references(() => users.id),
  status: text("status", { enum: ["running", "complete", "failed"] })
    .notNull()
    .default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  documentsConsidered: integer("documents_considered").notNull().default(0),
  exceptionsDetected: integer("exceptions_detected").notNull().default(0),
  errorSummary: text("error_summary"),
});

export const exceptionCases = pgTable("exception_cases", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  reconciliationRunId: uuid("reconciliation_run_id").references(() => reconciliationRuns.id),
  dedupeKey: text("dedupe_key").notNull(),
  type: text("type", {
    enum: [
      "price_variance",
      "quantity_variance",
      "duplicate_invoice",
      "missing_record",
      "delivery_delay",
      "tax_freight_variance",
    ],
  }).notNull(),
  title: text("title").notNull(),
  supplierId: uuid("supplier_id").references(() => suppliers.id),
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id),
  invoiceId: uuid("invoice_id").references(() => invoices.id),
  goodsReceiptId: uuid("goods_receipt_id").references(() => goodsReceipts.id),
  severity: text("severity", { enum: ["low", "medium", "high", "critical"] }).notNull(),
  status: text("status", {
    enum: ["open", "in_review", "awaiting_supplier", "awaiting_approval", "resolved"],
  })
    .notNull()
    .default("open"),
  assignedUserId: uuid("assigned_user_id").references(() => users.id),
  potentialExposureMinor: integer("potential_exposure_minor").notNull().default(0),
  exposureCurrency: text("exposure_currency").notNull().default("INR"),
  exposureIsEstimate: boolean("exposure_is_estimate").notNull().default(true),
  calculationDetailsJson: text("calculation_details_json").notNull(),
  resolutionReason: text("resolution_reason"),
  resolutionNotes: text("resolution_notes"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id),
  ...timestamps,
}, (t) => ({
  dedupeIdx: uniqueIndex("exception_dedupe_idx").on(t.orgId, t.dedupeKey),
}));

export const exceptionComments = pgTable("exception_comments", {
  id: id(),
  exceptionId: uuid("exception_id").notNull().references(() => exceptionCases.id),
  userId: uuid("user_id").references(() => users.id),
  body: text("body").notNull(),
  kind: text("kind", { enum: ["note", "ai_analysis", "system"] }).notNull().default("note"),
  ...timestamps,
});

export const supplierCommunications = pgTable("supplier_communications", {
  id: id(),
  exceptionId: uuid("exception_id").references(() => exceptionCases.id),
  supplierId: uuid("supplier_id").references(() => suppliers.id),
  recipientEmail: text("recipient_email"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status", { enum: ["draft", "recorded_sent"] }).notNull().default("draft"),
  ...timestamps,
});

export const auditEvents = pgTable("audit_events", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  metadataJson: text("metadata_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  entityIdx: index("audit_entity_idx").on(t.entityType, t.entityId),
}));
