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
  doc.setFontSize(20).setFont("helvetica", "bold").text("HEALTHREACH", left, y);
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
  doc.text("Thank you for using HEALTHREACH. Healthcare delivered to your door.", left, y);

  doc.save(`${r.invoice_number}.pdf`);
}
