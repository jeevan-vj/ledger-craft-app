import { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onFile: (file: File) => void;
  error?: string | null;
  disabled?: boolean;
}

export function InvoiceImportDropzone({ onFile, error, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const select = (file?: File) => file && onFile(file);
  return (
    <div>
      <button
        type="button"
        aria-label="Choose an invoice PDF, JPG or PNG to import"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); select(event.dataTransfer.files[0]); }}
        className={cn(
          'flex min-h-72 w-full flex-col items-center justify-center rounded-2xl border border-dashed bg-card px-6 py-12 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#163300] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
          dragging ? 'border-[#163300] bg-[#9FE870]/20' : 'border-border hover:border-[#163300] hover:bg-muted/40',
        )}
      >
        <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#9FE870] text-[#163300]"><FileUp aria-hidden="true" /></span>
        <span className="text-lg font-semibold">Drop an invoice or bill here</span>
        <span className="mt-2 max-w-md text-sm text-muted-foreground">or choose a PDF, JPG or PNG. You will review every field before a draft is created.</span>
        <span className="mt-5 rounded-full bg-[#9FE870] px-5 py-2.5 text-sm font-semibold text-[#163300]">Choose file</span>
      </button>
      <input ref={inputRef} className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png" aria-label="Invoice file" onChange={(event) => select(event.target.files?.[0])} />
      {error && <p className="mt-3 text-sm font-medium text-destructive" role="alert">{error}</p>}
    </div>
  );
}

