/**
 * Browsers do not always report a file's MIME type — Safari in particular
 * hands over an empty `type` for HEIC photos and for files picked out of
 * iCloud Drive. An empty type gets uploaded as application/octet-stream and
 * then bounced by the invoice content-type allowlist, so infer from the
 * extension before sending.
 */

const BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heic",
  gif: "image/gif",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
};

export function guessContentType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return (ext && BY_EXTENSION[ext]) || "application/octet-stream";
}

/** Content types the contractor invoice/document endpoints accept. */
export const DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
];

export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Check a document/invoice file before uploading, so the contractor gets a
 * sentence they can act on instead of the storage SDK's rejection.
 * Returns an error message, or null when the file is fine.
 */
export function checkDocumentFile(file: File): string | null {
  if (file.size === 0) return "That file is empty. Please pick another one.";
  if (file.size > DOCUMENT_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `That file is ${mb}MB. Please send one under 25MB (a PDF or a photo works best).`;
  }
  if (!DOCUMENT_CONTENT_TYPES.includes(guessContentType(file))) {
    return "Please upload a PDF, photo, Word, Excel, or CSV file.";
  }
  return null;
}
