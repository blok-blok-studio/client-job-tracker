import type { InvoiceView } from "./types";

/**
 * EN 16931 invoice as UN/CEFACT CII XML, the format behind ZUGFeRD / Factur-X
 * and accepted as a German E-Rechnung. VAT category codes follow the scheme:
 * E exempt (§ 19), S standard, AE reverse charge, O outside scope (non-EU).
 */
const x = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const d = (iso: string | null | undefined) => (iso || "").slice(0, 10).replace(/-/g, "");
const n = (v: number) => v.toFixed(2);

const CATEGORY: Record<string, { code: string; reason?: string }> = {
  REGULAR: { code: "S" },
  KLEINUNTERNEHMER: { code: "E", reason: "Kein Ausweis von Umsatzsteuer, da Kleinunternehmer gemäß § 19 UStG" },
  REVERSE_CHARGE: { code: "AE", reason: "Reverse charge" },
  DRITTLAND: { code: "O", reason: "Nicht im Inland steuerbare Leistung (§ 3a Abs. 2 UStG)" },
};

function addressParts(lines: string[]): { street: string; zip: string; city: string } {
  const cityLine = lines.find((l) => /\d{4,}/.test(l) && !/^\D*\d+\s*$/.test(l) && /[A-Za-zÄÖÜäöüß]{2,}/.test(l)) || lines[1] || "";
  const m = /^(\d{4,6})\s+(.+)$/.exec(cityLine) || /^(.+?),?\s+[A-Z]{2}\s+(\d{5})/.exec(cityLine);
  const zip = m ? (/^\d/.test(m[1]) ? m[1] : m[2]) : "";
  const city = m ? (/^\d/.test(m[1]) ? m[2] : m[1]) : cityLine;
  return { street: lines[0] || "", zip, city };
}

export function buildCiiXml(v: InvoiceView): string {
  const cat = CATEGORY[v.vatScheme] || CATEGORY.DRITTLAND;
  const seller = addressParts(v.seller.addressLines);
  const buyer = addressParts(v.billTo.addressLines);
  const typeCode = v.kind === "CORRECTION" ? "381" : "380";
  const lines = v.items
    .map(
      (it, i) => `    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${x(it.description)}</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${n(it.unitPrice)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">${it.qty}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${cat.code}</ram:CategoryCode><ram:RateApplicablePercent>${n(v.vatRate)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${n(it.lineTotal)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`
    )
    .join("\n");
  const iban = v.currency === "EUR" ? v.seller.eur?.iban : null;
  const sellerTax = [
    v.seller.ustIdNr ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${x(v.seller.ustIdNr)}</ram:ID></ram:SpecifiedTaxRegistration>` : "",
    v.seller.steuernummer ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${x(v.seller.steuernummer)}</ram:ID></ram:SpecifiedTaxRegistration>` : "",
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${x(v.number)}</ram:ID><ram:TypeCode>${typeCode}</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${d(v.issueDate)}</udt:DateTimeString></ram:IssueDateTime>
${v.vatNotes.map((t) => `    <ram:IncludedNote><ram:Content>${x(t)}</ram:Content></ram:IncludedNote>`).join("\n")}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
${lines}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty><ram:Name>${x(v.seller.sellerName)}</ram:Name><ram:PostalTradeAddress><ram:PostcodeCode>${x(seller.zip)}</ram:PostcodeCode><ram:LineOne>${x(seller.street)}</ram:LineOne><ram:CityName>${x(seller.city)}</ram:CityName><ram:CountryID>DE</ram:CountryID></ram:PostalTradeAddress>${sellerTax}</ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:Name>${x(v.billTo.company || v.billTo.name)}</ram:Name><ram:PostalTradeAddress><ram:PostcodeCode>${x(buyer.zip)}</ram:PostcodeCode><ram:LineOne>${x(buyer.street)}</ram:LineOne><ram:CityName>${x(buyer.city)}</ram:CityName><ram:CountryID>${x(v.billTo.country || "DE")}</ram:CountryID></ram:PostalTradeAddress>${v.billTo.vatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${x(v.billTo.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}</ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery><ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${d(v.serviceDateTo || v.issueDate)}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent></ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${x(v.number)}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>${x(v.currency)}</ram:InvoiceCurrencyCode>
${iban ? `      <ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${x(iban)}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>` : `      <ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>30</ram:TypeCode></ram:SpecifiedTradeSettlementPaymentMeans>`}
      <ram:ApplicableTradeTax><ram:CalculatedAmount>${n(v.vatAmount)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>${cat.reason ? `<ram:ExemptionReason>${x(cat.reason)}</ram:ExemptionReason>` : ""}<ram:BasisAmount>${n(v.subtotal)}</ram:BasisAmount><ram:CategoryCode>${cat.code}</ram:CategoryCode><ram:RateApplicablePercent>${n(v.vatRate)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
${v.dueDate ? `      <ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">${d(v.dueDate)}</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>` : ""}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${n(v.subtotal)}</ram:LineTotalAmount><ram:TaxBasisTotalAmount>${n(v.subtotal)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${x(v.currency)}">${n(v.vatAmount)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${n(v.total)}</ram:GrandTotalAmount><ram:DuePayableAmount>${n(v.kind === "CORRECTION" ? 0 : v.total)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}
