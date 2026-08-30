import { jsPDF } from "jspdf";
import { getDocumentUrl } from "@/lib/storage.functions";
import { formatNaira, formatDate, STATUS_LABEL, type ApplicationStatus } from "@/lib/kaivra";

interface DocRow {
  id: string;
  kind: string;
  label: string | null;
  file_name: string | null;
  mime_type: string | null;
}

interface PaymentRow {
  amount: number | string;
  paid_on: string | null;
  bank: string | null;
  sender: string | null;
  reference: string | null;
  method: string;
  status: string;
  description: string | null;
}

export interface PdfInput {
  application: {
    id: string;
    reference: string | null;
    status: string;
    submitted_at: string | null;
    application_method: string;
    personal: Record<string, unknown>;
    contact: Record<string, unknown>;
    investment: Record<string, unknown>;
    payment_info: Record<string, unknown>;
    declaration_accepted: boolean;
    projects?: { name?: string; location?: string; currency?: string } | null;
    properties?: { name?: string; property_type?: string; size_label?: string; unit_price?: number } | null;
  };
  payments: PaymentRow[];
  documents: DocRow[];
  investorName: string;
  adviserName?: string | null;
}

async function fetchImage(documentId: string): Promise<{ dataUrl: string; format: string } | null> {
  try {
    const { url, mimeType } = await getDocumentUrl({ data: { documentId } });
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { dataUrl, format: (mimeType ?? "image/jpeg").includes("png") ? "PNG" : "JPEG" };
  } catch {
    return null;
  }
}

const ONYX: [number, number, number] = [26, 32, 29];
const GOLD: [number, number, number] = [198, 165, 106];
const EMERALD: [number, number, number] = [26, 96, 71];
const GREY: [number, number, number] = [110, 116, 112];

export async function generateApplicationPdf(input: PdfInput): Promise<jsPDF> {
  const { application: app, payments, documents } = input;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 46;
  let y = 0;

  const personal = (app.personal ?? {}) as Partial<{
    full_name: string;
    date_of_birth: string;
    gender: string;
    nationality: string;
    marital_status: string;
    occupation: string;
    company: string;
    residential_address: string;
    state: string;
    country: string;
  }>;
  const contact = (app.contact ?? {}) as Partial<{
    phone: string;
    email: string;
    whatsapp: string;
    alt_phone: string;
    residential_address: string;
    mailing_address: string;
  }>;
  const investment = (app.investment ?? {}) as Partial<{
    total_value: number;
    units: number;
    unit_price: number;
    payment_plan: string;
  }>;
  const paymentInfo = (app.payment_info ?? {}) as Partial<{
    subscriber_name: string;
    sender: string;
    bank: string;
    site: string;
    initial_deposit: number;
    next_payment_amount: number;
    next_payment_date: string;
    description: string;
  }>;
  const currency = app.projects?.currency ?? "NGN";

  const totalValue = Number(investment.total_value ?? 0);
  const paid = payments
    .filter((p) => p.status !== "rejected")
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const outstanding = Math.max(0, totalValue - paid);

  const passport = documents.find((d) => d.kind === "passport");
  const signature = documents.find((d) => d.kind === "signature");
  const [passportImg, signatureImg] = await Promise.all([
    passport ? fetchImage(passport.id) : Promise.resolve(null),
    signature ? fetchImage(signature.id) : Promise.resolve(null),
  ]);

  function footer() {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(...GOLD);
      doc.setLineWidth(0.6);
      doc.line(M, H - 44, W - M, H - 44);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...GREY);
      doc.text(`Application Reference: ${app.reference ?? "DRAFT"}`, M, H - 30);
      doc.text(`Generated ${formatDate(new Date().toISOString())}`, W / 2, H - 30, { align: "center" });
      doc.text(`Page ${i} of ${pages}`, W - M, H - 30, { align: "right" });
    }
  }

  function ensure(space: number) {
    if (y + space > H - 70) {
      doc.addPage();
      y = M;
    }
  }

  function sectionTitle(title: string) {
    ensure(46);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(1.2);
    doc.line(M, y, M + 26, y);
    y += 16;
    doc.setFont("times", "normal");
    doc.setFontSize(14);
    doc.setTextColor(...ONYX);
    doc.text(title, M, y);
    y += 14;
  }

  function rows(entries: [string, string][]) {
    doc.setFontSize(9);
    const colWidth = (W - M * 2) / 2;
    entries.forEach((entry, index) => {
      const col = index % 2;
      if (col === 0) ensure(34);
      const x = M + col * colWidth;
      const rowY = y;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...GREY);
      doc.text(entry[0].toUpperCase(), x, rowY);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...ONYX);
      const text = doc.splitTextToSize(entry[1] || "—", colWidth - 16);
      doc.text(text.slice(0, 2), x, rowY + 12);
      if (col === 1 || index === entries.length - 1) y += 32;
    });
    y += 6;
  }

  // ---------- Cover header ----------
  doc.setFillColor(...ONYX);
  doc.rect(0, 0, W, 132, "F");
  doc.setFont("times", "normal");
  doc.setFontSize(30);
  doc.setTextColor(250, 249, 245);
  doc.text("KAIVRA", M, 62);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.text("REAL ESTATE INVESTMENT MANAGEMENT", M, 78);
  doc.setFontSize(9);
  doc.setTextColor(230, 230, 226);
  doc.text("INVESTMENT SUBSCRIPTION APPLICATION", W - M, 62, { align: "right" });
  doc.setFontSize(8);
  doc.text(`Reference  ${app.reference ?? "DRAFT"}`, W - M, 78, { align: "right" });
  doc.text(`Status  ${STATUS_LABEL[app.status as ApplicationStatus]}`, W - M, 92, { align: "right" });

  y = 168;

  // Project banner + passport
  doc.setFont("times", "normal");
  doc.setFontSize(18);
  doc.setTextColor(...ONYX);
  doc.text(doc.splitTextToSize(app.projects?.name ?? "Project", W - M * 2 - 110)[0] ?? "", M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text(app.projects?.location ?? "", M, y + 16);
  doc.text(`Submitted ${formatDate(app.submitted_at)}`, M, y + 30);
  doc.text(
    `Application method: ${app.application_method === "assisted" ? "Assisted Registration" : "Self service"}`,
    M,
    y + 44,
  );

  if (passportImg) {
    try {
      doc.addImage(passportImg.dataUrl, passportImg.format, W - M - 92, y - 22, 92, 110);
      doc.setDrawColor(...GOLD);
      doc.rect(W - M - 92, y - 22, 92, 110);
    } catch {
      /* image unusable — continue without it */
    }
  }

  y += 110;

  sectionTitle("Personal Details");
  rows([
    ["Full name", personal.full_name ?? input.investorName],
    ["Date of birth", personal.date_of_birth ? formatDate(personal.date_of_birth) : "—"],
    ["Gender", personal.gender ?? "—"],
    ["Nationality", personal.nationality ?? "—"],
    ["Marital status", personal.marital_status ?? "—"],
    ["Occupation", personal.occupation ?? "—"],
    ["Company / Organisation", personal.company ?? "—"],
    ["Residential address", personal.residential_address ?? "—"],
    ["State", personal.state ?? "—"],
    ["Country", personal.country ?? "—"],
  ]);

  sectionTitle("Contact Details");
  rows([
    ["Phone number", contact.phone ?? "—"],
    ["Email address", contact.email ?? "—"],
    ["WhatsApp number", contact.whatsapp ?? "—"],
    ["Alternative phone", contact.alt_phone ?? "—"],
    ["Residential address", contact.residential_address ?? personal.residential_address ?? "—"],
    ["Mailing address", contact.mailing_address ?? "—"],
  ]);

  sectionTitle("Investment & Property");
  rows([
    ["Project", app.projects?.name ?? "—"],
    ["Property", app.properties?.name ?? "—"],
    ["Property type", app.properties?.property_type ?? "—"],
    ["Property size", app.properties?.size_label ?? "—"],
    ["Number of units", String(investment.units ?? 1)],
    ["Unit price", formatNaira(investment.unit_price ?? app.properties?.unit_price ?? 0, currency)],
    ["Payment plan", String(investment.payment_plan ?? "—")],
    ["Total investment value", formatNaira(totalValue, currency)],
  ]);

  // Financial summary block
  ensure(70);
  doc.setFillColor(246, 245, 240);
  doc.rect(M, y, W - M * 2, 56, "F");
  const cellW = (W - M * 2) / 3;
  const summary: [string, string][] = [
    ["TOTAL INVESTMENT", formatNaira(totalValue, currency)],
    ["TOTAL PAID", formatNaira(paid, currency)],
    ["OUTSTANDING", formatNaira(outstanding, currency)],
  ];
  summary.forEach((cell, i) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY);
    doc.text(cell[0], M + 14 + i * cellW, y + 22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...(i === 1 ? EMERALD : ONYX));
    doc.text(cell[1], M + 14 + i * cellW, y + 40);
  });
  y += 76;

  sectionTitle("Payment History");
  ensure(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  const cols = [M, M + 84, M + 190, M + 300, M + 396, M + 470];
  ["AMOUNT", "DATE", "BANK / SENDER", "REFERENCE", "METHOD", "STATUS"].forEach((h, i) =>
    doc.text(h, cols[i]!, y),
  );
  y += 6;
  doc.setDrawColor(220, 218, 210);
  doc.line(M, y, W - M, y);
  y += 14;

  if (payments.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GREY);
    doc.text("No payment records.", M, y);
    y += 20;
  } else {
    payments.forEach((p) => {
      ensure(24);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...ONYX);
      doc.text(formatNaira(p.amount, currency), cols[0]!, y);
      doc.text(formatDate(p.paid_on), cols[1]!, y);
      doc.text(doc.splitTextToSize(`${p.bank ?? "—"} / ${p.sender ?? "—"}`, 104)[0] ?? "", cols[2]!, y);
      doc.text(doc.splitTextToSize(p.reference ?? "—", 90)[0] ?? "", cols[3]!, y);
      doc.text(p.method.replace(/_/g, " "), cols[4]!, y);
      doc.setTextColor(...(p.status === "verified" ? EMERALD : GREY));
      doc.text(p.status.toUpperCase(), cols[5]!, y);
      y += 18;
    });
  }
  y += 8;

  sectionTitle("Payment Confirmation Details");
  rows([
    ["Subscriber's name", String(paymentInfo.subscriber_name ?? personal.full_name ?? "—")],
    ["Sender", String(paymentInfo.sender ?? "—")],
    ["Bank", String(paymentInfo.bank ?? "—")],
    ["Site", String(paymentInfo.site ?? app.projects?.name ?? "—")],
    ["Initial deposit", formatNaira(paymentInfo.initial_deposit ?? 0, currency)],
    ["Total payment made", formatNaira(paid, currency)],
    ["Next payment amount", formatNaira(paymentInfo.next_payment_amount ?? 0, currency)],
    ["Next payment date", paymentInfo.next_payment_date ? formatDate(String(paymentInfo.next_payment_date)) : "—"],
    ["Payment description", String(paymentInfo.description ?? "—")],
    ["Investment adviser", input.adviserName ?? "—"],
  ]);

  sectionTitle("Documents Submitted");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...ONYX);
  if (documents.length === 0) {
    doc.setTextColor(...GREY);
    doc.text("No documents uploaded.", M, y);
    y += 18;
  } else {
    documents.forEach((d) => {
      ensure(18);
      doc.text(`• ${d.label ?? d.kind.replace(/_/g, " ")} — ${d.file_name ?? "file"}`, M, y);
      y += 15;
    });
  }
  y += 10;

  sectionTitle("Declaration");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...ONYX);
  const declaration =
    "I confirm that the information provided in this application is true and accurate to the best of my knowledge. I confirm that the payment information and documents submitted relate to my investment/application.";
  const lines = doc.splitTextToSize(declaration, W - M * 2);
  ensure(lines.length * 12 + 90);
  doc.text(lines, M, y);
  y += lines.length * 12 + 10;
  doc.setFont("helvetica", "bold");
  doc.text(app.declaration_accepted ? "Declaration accepted by the investor." : "Declaration not yet accepted.", M, y);
  y += 26;

  if (signatureImg) {
    try {
      doc.addImage(signatureImg.dataUrl, signatureImg.format, M, y, 150, 56);
    } catch {
      /* ignore unusable signature image */
    }
  }
  doc.setDrawColor(...GREY);
  doc.line(M, y + 62, M + 200, y + 62);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text("Investor Signature", M, y + 74);
  doc.setTextColor(...ONYX);
  doc.setFontSize(9);
  doc.text(personal.full_name ?? input.investorName, M, y + 88);

  footer();
  return doc;
}

export async function downloadApplicationPdf(input: PdfInput) {
  const doc = await generateApplicationPdf(input);
  doc.save(`KAIVRA-${input.application.reference ?? "application"}.pdf`);
}
