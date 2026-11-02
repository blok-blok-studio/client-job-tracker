import { Suspense } from "react";
import InvoicesPage from "@/components/invoices/InvoicesPage";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <InvoicesPage />
    </Suspense>
  );
}
