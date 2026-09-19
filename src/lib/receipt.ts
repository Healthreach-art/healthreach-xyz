import { jsPDF } from "jspdf";

interface Receipt {
  invoice_number: string;
  created_at: string;
  patient_name?: string;
  medication_name: string;
  quantity: number;
  subtotal: number;
  delivery_fee: number;
  total_paid: number;
  payment_method: string;
  transaction_ref?: string;
  pharmacy_name?: string;
}

export function downloadReceiptPdf(r: Receipt) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 48;
  let y = 60;
  doc.setFontSize(20).setFont("helvetica", "bold").text("HealthReachCareCare", left, y);
  doc.setFontSize(10).setFont("helvetica", "normal").text("Medication Delivery Receipt", left, y + 16);

  y += 60;
  doc.setFontSize(11).setFont("helvetica", "bold").text("Invoice", left, y);
  doc.setFont("helvetica", "normal").text(r.invoice_number, left + 80, y);
  y += 16;
  doc.setFont("helvetica", "bold").text("Date", left, y);
  doc.setFont("helvetica", "normal").text(new Date(r.created_at).toLocaleString("en-ZA"), left + 80, y);
  if (r.patient_name) { y += 16; doc.setFont("helvetica", "bold").text("Customer", left, y); doc.setFont("helvetica", "normal").text(r.patient_name, left + 80, y); }
  if (r.pharmacy_name) { y += 16; doc.setFont("helvetica", "bold").text("Pharmacy", left, y); doc.setFont("helvetica", "normal").text(r.pharmacy_name, left + 80, y); }

  y += 32;
  doc.setDrawColor(200).line(left, y, 547, y);
  y += 20;
  doc.setFont("helvetica", "bold").text("Item", left, y).text("Qty", 360, y).text("Amount", 480, y);
  y += 6; doc.line(left, y, 547, y); y += 20;
  doc.setFont("helvetica", "normal").text(r.medication_name, left, y).text(String(r.quantity), 360, y).text(`R ${r.subtotal.toFixed(2)}`, 480, y);
  y += 18; doc.text("Delivery fee", left, y).text("", 360, y).text(`R ${r.delivery_fee.toFixed(2)}`, 480, y);
  y += 6; doc.line(left, y, 547, y); y += 20;
  doc.setFont("helvetica", "bold").text("Total Paid", left, y).text(`R ${r.total_paid.toFixed(2)}`, 480, y);

  y += 40;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(120);
  doc.text(`Payment method: ${r.payment_method.toUpperCase()}`, left, y);
  if (r.transaction_ref) { y += 14; doc.text(`Transaction ref: ${r.transaction_ref}`, left, y); }
  y += 28;
  doc.text("Thank you for using HealthReachCareCare. Healthcare delivered to your door.", left, y);

  doc.save(`${r.invoice_number}.pdf`);
}

export interface TaxStatementRow {
  invoice_number: string;
  created_at: string;
  medication_name: string;
  gross: number;        // total customer paid
  platform_fee: number; // HealthReachCareCare commission
  delivery_fee: number;
  net_earned: number;   // pharmacy net (VAT-inclusive)
  status: string;
}

export interface TaxStatementInput {
  pharmacy_name: string;
  vat_number?: string;
  address?: string;
  period_from: string;  // ISO
  period_to: string;    // ISO
  rows: TaxStatementRow[];
}

/** Pharmacy tax statement: header + per-transaction line items + totals.
 *  VAT shown at SA standard rate (15%) on net earnings, for accountant reference. */
export function downloadPharmacyTaxStatementPdf(input: TaxStatementInput) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 40;
  const right = 555;
  let y = 50;

  // Header
  doc.setFontSize(18).setFont("helvetica", "bold").text("HealthReachCareCare", left, y);
  doc.setFontSize(10).setFont("helvetica", "normal").setTextColor(110)
    .text("Pharmacy Tax Statement", left, y + 14);
  doc.setTextColor(0);
  y += 44;

  doc.setFontSize(11).setFont("helvetica", "bold").text(input.pharmacy_name, left, y);
  y += 14;
  doc.setFont("helvetica", "normal").setFontSize(10);
  if (input.address) { doc.text(input.address, left, y); y += 12; }
  if (input.vat_number) { doc.text(`VAT No: ${input.vat_number}`, left, y); y += 12; }
  doc.text(
    `Period: ${new Date(input.period_from).toLocaleDateString("en-ZA")} – ${new Date(input.period_to).toLocaleDateString("en-ZA")}`,
    left, y,
  );
  doc.text(`Generated: ${new Date().toLocaleString("en-ZA")}`, left, y + 12);
  y += 32;

  // Totals
  const totals = input.rows.reduce(
    (s, r) => ({
      gross: s.gross + r.gross,
      platform: s.platform + r.platform_fee,
      delivery: s.delivery + r.delivery_fee,
      net: s.net + r.net_earned,
    }),
    { gross: 0, platform: 0, delivery: 0, net: 0 },
  );
  const vatRate = 0.15;
  const vatPortion = totals.net - totals.net / (1 + vatRate);
  const exVat = totals.net - vatPortion;

  // Summary box
  doc.setDrawColor(220).setFillColor(245, 250, 255).rect(left, y, right - left, 70, "FD");
  doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(0);
  doc.text("Summary", left + 10, y + 16);
  doc.setFont("helvetica", "normal");
  const col1 = left + 10, col2 = left + 180, col3 = left + 360;
  doc.text(`Transactions: ${input.rows.length}`, col1, y + 34);
  doc.text(`Gross sales: R ${totals.gross.toFixed(2)}`, col2, y + 34);
  doc.text(`Platform fees: R ${totals.platform.toFixed(2)}`, col3, y + 34);
  doc.text(`Net earned (VAT incl.): R ${totals.net.toFixed(2)}`, col1, y + 50);
  doc.text(`Net excl. VAT: R ${exVat.toFixed(2)}`, col2, y + 50);
  doc.text(`VAT (15%): R ${vatPortion.toFixed(2)}`, col3, y + 50);
  y += 90;

  // Table header
  doc.setFont("helvetica", "bold").setFontSize(9);
  doc.text("Invoice", left, y);
  doc.text("Date", left + 80, y);
  doc.text("Item", left + 160, y);
  doc.text("Gross", left + 320, y, { align: "right" });
  doc.text("Fee", left + 380, y, { align: "right" });
  doc.text("Delivery", left + 440, y, { align: "right" });
  doc.text("Net", right - 10, y, { align: "right" });
  y += 6; doc.setDrawColor(180).line(left, y, right, y); y += 12;

  doc.setFont("helvetica", "normal").setFontSize(9);
  for (const r of input.rows) {
    if (y > 780) {
      doc.addPage(); y = 50;
      doc.setFont("helvetica", "bold").setFontSize(9);
      doc.text("Invoice", left, y);
      doc.text("Date", left + 80, y);
      doc.text("Item", left + 160, y);
      doc.text("Gross", left + 320, y, { align: "right" });
      doc.text("Fee", left + 380, y, { align: "right" });
      doc.text("Delivery", left + 440, y, { align: "right" });
      doc.text("Net", right - 10, y, { align: "right" });
      y += 6; doc.line(left, y, right, y); y += 12;
      doc.setFont("helvetica", "normal");
    }
    doc.text(String(r.invoice_number).slice(0, 14), left, y);
    doc.text(new Date(r.created_at).toLocaleDateString("en-ZA"), left + 80, y);
    doc.text(String(r.medication_name).slice(0, 28), left + 160, y);
    doc.text(r.gross.toFixed(2), left + 320, y, { align: "right" });
    doc.text(r.platform_fee.toFixed(2), left + 380, y, { align: "right" });
    doc.text(r.delivery_fee.toFixed(2), left + 440, y, { align: "right" });
    doc.text(r.net_earned.toFixed(2), right - 10, y, { align: "right" });
    y += 14;
  }

  y += 10; doc.setDrawColor(200).line(left, y, right, y); y += 16;
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text("Totals", left, y);
  doc.text(`R ${totals.gross.toFixed(2)}`, left + 320, y, { align: "right" });
  doc.text(`R ${totals.platform.toFixed(2)}`, left + 380, y, { align: "right" });
  doc.text(`R ${totals.delivery.toFixed(2)}`, left + 440, y, { align: "right" });
  doc.text(`R ${totals.net.toFixed(2)}`, right - 10, y, { align: "right" });

  y += 30;
  doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(120);
  doc.text(
    "Generated by HealthReachCareCare for record-keeping. Confirm VAT treatment with your accountant.",
    left, y,
  );

  const fname = `tax-statement_${input.period_from.slice(0,10)}_${input.period_to.slice(0,10)}.pdf`;
  doc.save(fname);
}
