import QRCode from "qrcode";

/**
 * EPC QR code ("GiroCode"): the SEPA credit-transfer QR every German and most
 * European banking apps scan. The client opens their app, scans, and the
 * transfer is pre-filled with our IBAN, the amount and the invoice number as
 * the reference — no typing, no typos in the Verwendungszweck.
 *
 * Spec: European Payments Council, "Quick Response Code: Guidelines to Enable
 * Data Capture for the Initiation of a SEPA Credit Transfer", version 002.
 */
export interface EpcInput {
  name: string; // beneficiary, max 70 chars
  iban: string;
  bic?: string | null; // optional in version 002 inside the EEA
  amount: number; // EUR, 0.01 .. 999999999.99
  reference: string; // unstructured remittance, max 140 chars — our invoice number
}

function clean(s: string, max: number): string {
  // The payload is UTF-8 (field 3 = "1"), but keep it to characters every bank parses
  return s.replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

export function buildEpcPayload(input: EpcInput): string {
  const iban = input.iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) throw new Error("EPC QR: invalid IBAN");
  if (!(input.amount >= 0.01 && input.amount <= 999999999.99)) throw new Error("EPC QR: amount out of range");
  const lines = [
    "BCD", // service tag
    "002", // version
    "1", // character set: UTF-8
    "SCT", // SEPA credit transfer
    clean(input.bic || "", 11),
    clean(input.name, 70),
    iban,
    `EUR${input.amount.toFixed(2)}`,
    "", // purpose code
    "", // structured reference (unused — we use the free-text one)
    clean(input.reference, 140),
    "", // beneficiary-to-originator information
  ];
  return lines.join("\n");
}

/** PNG bytes for the PDF. Error correction M is what the EPC guideline requires. */
export async function qrPng(payload: string, px = 512): Promise<Uint8Array> {
  const buf = await QRCode.toBuffer(payload, { errorCorrectionLevel: "M", margin: 1, width: px, type: "png" });
  return new Uint8Array(buf);
}

/** data: URL for the web view. */
export async function qrDataUrl(payload: string, px = 320): Promise<string> {
  return QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: px });
}
