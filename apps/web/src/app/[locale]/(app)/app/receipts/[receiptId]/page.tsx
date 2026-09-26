import type { Locale } from "@/i18n/locales";
import { ReceiptDetailScreen } from "@/features/service-management/receipts/details/receipt-detail-screen";

export default async function ReceiptPage({
    params,
}: Readonly<{ params: Promise<{ locale: Locale; receiptId: string }> }>) {
    const { locale, receiptId } = await params;
    return <ReceiptDetailScreen locale={locale} receiptId={receiptId} />;
}
