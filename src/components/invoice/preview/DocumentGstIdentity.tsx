import type { DocumentLabels } from './documentLabels';

export function DocumentGstIdentity({ labels, className = '' }: { labels: DocumentLabels; className?: string }) {
  return <>
    {labels.sellerTaxId ? <p className={`text-xs sm:text-sm ${className}`}>GST No: {labels.sellerTaxId}</p> : null}
    {labels.taxPriceNote ? <p className={`text-xs ${className}`}>{labels.taxPriceNote}</p> : null}
    {labels.taxReviewWarning ? <p role="alert" className="mt-1 rounded border border-amber-300 bg-amber-50 p-1 text-xs text-amber-950">{labels.taxReviewWarning}</p> : null}
  </>;
}
