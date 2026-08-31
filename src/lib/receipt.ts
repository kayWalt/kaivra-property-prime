import { formatMoneyPdf, formatDate } from "@/lib/kaivra";

export interface ReceiptInput {
  investorName: string;
  project: string;
  property: string;
  applicationReference: string;
  transactionReference: string;
  paidOn: string | null;
  amount: number | string;
  method: string;
  bank: string | null;
  sender: string | null;
  status: string;
  verifiedAt: string | null;
  currency?: string;
}

const ONYX: [number, number, number] = [18, 20, 20];
const GREY: [number, number, number] = [110, 115, 115];
const GOLD: [number, number, number] = [176, 141, 87];

/** Lazily loads jsPDF so the receipt never lands in the initial bundle. */
export async function downloadPaymentReceipt(input: ReceiptInput) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const M = 48;
  const W = doc.internal.pageSize.getWidth();

  doc.setFillColor(...ONYX);
  doc.rect(0, 0, W, 96, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "normal");
  doc.setFontSize(26);
  doc.text("KAIVRA", M, 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.text("REAL ESTATE INVESTMENT MANAGEMENT", M, 64);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text("PAYMENT RECEIPT", W - M, 48, { align: "right" });
  doc.setFontSize(9);
  doc.text(input.transactionReference, W - M, 64, { align: "right" });

  let y = 140;
  doc.setTextColor(...ONYX);
  doc.setFont("times", "normal");
  doc.setFontSize(20);
  doc.text(formatMoneyPdf(input.amount, input.currency ?? "NGN"), M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text(`Received on ${formatDate(input.paidOn)}`, M, y + 16);

  y += 56;
  const rows: [string, string][] = [
    ["Investor", input.investorName],
    ["Project", input.project],
    ["Property", input.property],
    ["Application reference", input.applicationReference],
    ["Transaction reference", input.transactionReference],
    ["Payment date", formatDate(input.paidOn)],
    ["Amount", formatMoneyPdf(input.amount, input.currency ?? "NGN")],
    ["Payment method", input.method.replace(/_/g, " ")],
    ["Bank", input.bank ?? "—"],
    ["Sender", input.sender ?? "—"],
    ["Payment status", input.status.replace(/_/g, " ")],
    ["Verification date", input.verifiedAt ? formatDate(input.verifiedAt) : "—"],
  ];

  for (const [label, value] of rows) {
    doc.setDrawColor(228, 226, 220);
    doc.line(M, y + 6, W - M, y + 6);
    doc.setTextColor(...GREY);
    doc.setFontSize(8);
    doc.text(label.toUpperCase(), M, y);
    doc.setTextColor(...ONYX);
    doc.setFontSize(10);
    doc.text(String(value || "—"), W - M, y, { align: "right" });
    y += 28;
  }

  doc.setTextColor(...GREY);
  doc.setFontSize(8);
  doc.text(
    "This receipt is issued by KAIVRA as a record of the payment shown above.",
    M,
    doc.internal.pageSize.getHeight() - 48,
  );

  doc.save(`KAIVRA-receipt-${input.transactionReference}.pdf`);
}
