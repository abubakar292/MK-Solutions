import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import {
  AlertTriangle,
  Download,
  Maximize2,
  Printer,
  RefreshCw,
  Share2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  MOTION_DURATIONS,
  MOTION_EASING,
  prefersReducedMotion,
  usePressFeedback,
} from '../../lib/motion';
import { notify } from '../../lib/notify';
import { cn } from '../../lib/utils';
import { BrandLoader } from '../loader/BrandLoader';
import { Button } from '../ui/Button';
import {
  generateDocumentPdfBlob,
  type PrintableDocumentMeta,
} from './PrintLayout';

export interface RenderedPdfPage {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

export interface PrintPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  doc: PrintableDocumentMeta | null;
  companyId?: string;
}

/**
 * Formats a human-readable document name for the Print dialog header and Share sheet,
 * e.g. "Bill INV-2026-0001".
 */
export function getPrintDocumentDisplayName(doc: PrintableDocumentMeta): string {
  const rawTitle = (doc.title || 'Document').trim();
  const rawNum = (doc.docNumber || '').trim();
  const lower = rawTitle.toLowerCase();
  const normalizedTitle =
    lower === 'sales bill / invoice' || lower === 'sales bill' ? 'Bill' : rawTitle;

  if (!rawNum) return normalizedTitle;
  if (normalizedTitle.toLowerCase().includes(rawNum.toLowerCase())) {
    return normalizedTitle;
  }
  return `${normalizedTitle} ${rawNum}`;
}

/**
 * Formats a clean PDF filename for Share and Download PDF,
 * e.g. "Bill-INV-2026-0001.pdf".
 */
export function getPrintDocumentFileName(doc: PrintableDocumentMeta): string {
  const displayName = getPrintDocumentDisplayName(doc);
  const cleaned = displayName
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${cleaned || 'Document'}.pdf`;
}

function removeExistingPrintRoot(): void {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('print-root');
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }
  document.body.classList.remove('mk-printing-active');
}

function mountPrintRootWithPages(pages: RenderedPdfPage[]): HTMLElement {
  removeExistingPrintRoot();
  const printRoot = document.createElement('div');
  printRoot.id = 'print-root';
  printRoot.setAttribute('aria-hidden', 'true');

  for (const page of pages) {
    const img = document.createElement('img');
    img.className = 'print-page-image';
    img.src = page.dataUrl;
    img.alt = `Page ${page.pageNumber}`;
    printRoot.appendChild(img);
  }

  document.body.appendChild(printRoot);
  document.body.classList.add('mk-printing-active');
  return printRoot;
}

const ZOOM_STEPS = [0.6, 0.75, 0.9, 1.0, 1.15, 1.3, 1.5, 1.75, 2.0];
const BASE_FIT_MAX_WIDTH = 720;

const ToolbarIconButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}> = ({ onClick, disabled, ariaLabel, children }) => {
  const btnRef = useRef<HTMLButtonElement>(null);
  usePressFeedback(btnRef, { disabled: Boolean(disabled) });

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="h-8 w-8 rounded-[8px] inline-flex items-center justify-center text-[var(--text)] border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--surface-subtle)] disabled:opacity-45 disabled:pointer-events-none cursor-pointer transition-colors focus-ring"
    >
      {children}
    </button>
  );
};

export const PrintPreviewDialog: React.FC<PrintPreviewDialogProps> = ({
  open,
  onClose,
  doc,
  companyId,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pagesWrapperRef = useRef<HTMLDivElement>(null);
  const printBtnRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const fitBtnRef = useRef<HTMLButtonElement>(null);

  usePressFeedback(fitBtnRef);

  const [status, setStatus] = useState<'preparing' | 'ready' | 'error'>('preparing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pages, setPages] = useState<RenderedPdfPage[]>([]);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoomMode, setZoomMode] = useState<'fit' | 'custom'>('fit');
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [retryTick, setRetryTick] = useState<number>(0);
  const [sharing, setSharing] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [highlightDownload, setHighlightDownload] = useState<boolean>(false);

  // Dialog entrance animation (GSAP fade & scale, respects reduced motion)
  useGSAP(
    () => {
      if (!open) return;
      const panel = panelRef.current;
      const backdrop = backdropRef.current;

      if (prefersReducedMotion()) {
        if (backdrop) gsap.set(backdrop, { opacity: 1 });
        if (panel) gsap.set(panel, { opacity: 1, scale: 1, y: 0 });
        return;
      }

      if (backdrop) {
        gsap.killTweensOf(backdrop);
        gsap.fromTo(
          backdrop,
          { opacity: 0 },
          { opacity: 1, duration: MOTION_DURATIONS.fast, ease: MOTION_EASING.in }
        );
      }

      if (panel) {
        gsap.killTweensOf(panel);
        gsap.fromTo(
          panel,
          { opacity: 0, scale: 0.96, y: 8 },
          {
            opacity: 1,
            scale: 1,
            y: 0,
            duration: MOTION_DURATIONS.base,
            ease: MOTION_EASING.in,
            clearProps: 'transform',
          }
        );
      }

      return () => {
        if (backdrop) gsap.killTweensOf(backdrop);
        if (panel) gsap.killTweensOf(panel);
      };
    },
    { dependencies: [open] }
  );

  // Pages staggered entrance animation when pages become ready
  useGSAP(
    () => {
      if (!open || status !== 'ready' || pages.length === 0) return;
      const wrapper = pagesWrapperRef.current;
      if (!wrapper) return;

      const pageEls = Array.from(
        wrapper.querySelectorAll<HTMLElement>('[data-print-page]')
      );
      if (pageEls.length === 0) return;

      if (prefersReducedMotion()) {
        gsap.set(pageEls, { opacity: 1, y: 0 });
        return;
      }

      const tween = gsap.fromTo(
        pageEls,
        { opacity: 0, y: 14 },
        {
          opacity: 1,
          y: 0,
          duration: 0.35,
          stagger: 0.06,
          ease: MOTION_EASING.in,
          clearProps: 'transform',
        }
      );

      return () => {
        tween.kill();
      };
    },
    { dependencies: [open, status, pages.length], scope: pagesWrapperRef }
  );

  // Generate PDF blob and render pages with pdf.js at 2.5x scale
  useEffect(() => {
    if (!open || !doc) {
      setPages([]);
      setPdfBlob(null);
      setStatus('preparing');
      setErrorMessage(null);
      setHighlightDownload(false);
      return;
    }

    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let activeLoadingTask: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let activePdfDoc: any = null;

    setStatus('preparing');
    setErrorMessage(null);
    setPages([]);
    setPdfBlob(null);
    setCurrentPage(1);
    setZoomMode('fit');
    setZoomScale(1.0);
    setHighlightDownload(false);

    const preparePages = async () => {
      try {
        const blob = await generateDocumentPdfBlob(doc, companyId);
        if (cancelled) return;
        setPdfBlob(blob);

        const [pdfjsLib, workerUrlMod] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]);
        if (cancelled) return;

        if (pdfjsLib.GlobalWorkerOptions && workerUrlMod?.default) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrlMod.default;
        }

        const arrayBuffer = await blob.arrayBuffer();
        if (cancelled) return;

        activeLoadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuffer),
        });
        activePdfDoc = await activeLoadingTask.promise;
        if (cancelled) return;

        const numPages: number = activePdfDoc.numPages || 1;
        const rendered: RenderedPdfPage[] = [];

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          if (cancelled) break;
          const page = await activePdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2.5 });

          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Canvas 2D context is unavailable on this browser.');
          }

          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({
            canvasContext: ctx,
            viewport,
            canvas,
          }).promise;

          const dataUrl = canvas.toDataURL('image/png');
          rendered.push({
            pageNumber: pageNum,
            dataUrl,
            width: canvas.width,
            height: canvas.height,
          });

          page.cleanup();
          canvas.width = 0;
          canvas.height = 0;
        }

        if (cancelled) return;

        setPages(rendered);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Could not render the document pages. Check your data and try again.'
        );
      } finally {
        try {
          if (activePdfDoc && typeof activePdfDoc.destroy === 'function') {
            await activePdfDoc.destroy();
          }
        } catch {
          // Ignore destroy errors
        }
        try {
          if (activeLoadingTask && typeof activeLoadingTask.destroy === 'function') {
            await activeLoadingTask.destroy();
          }
        } catch {
          // Ignore destroy errors
        }
      }
    };

    void preparePages();

    return () => {
      cancelled = true;
      try {
        if (activePdfDoc && typeof activePdfDoc.destroy === 'function') {
          void activePdfDoc.destroy();
        }
      } catch {
        // Ignore cleanup errors
      }
      try {
        if (activeLoadingTask && typeof activeLoadingTask.destroy === 'function') {
          void activeLoadingTask.destroy();
        }
      } catch {
        // Ignore cleanup errors
      }
      removeExistingPrintRoot();
    };
  }, [open, doc, companyId, retryTick]);

  // Focus management: focus Print button when ready, or Close button when open
  useEffect(() => {
    if (!open) return;
    if (status === 'ready' && printBtnRef.current) {
      printBtnRef.current.focus();
    } else if (closeBtnRef.current) {
      closeBtnRef.current.focus();
    }
  }, [open, status]);

  // Lock body scroll and trap keyboard focus + Escape inside the dialog
  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        removeExistingPrintRoot();
        onClose();
        return;
      }

      if (e.key === 'Tab' && panelRef.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null);

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (e.shiftKey) {
          if (!active || active === first || !panelRef.current.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (!active || active === last || !panelRef.current.contains(active)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, onClose]);

  // Track visible page number on scroll
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    const wrapper = pagesWrapperRef.current;
    if (!container || !wrapper || pages.length <= 1) return;

    const containerRect = container.getBoundingClientRect();
    const targetY = containerRect.top + containerRect.height * 0.35;

    const pageNodes = Array.from(
      wrapper.querySelectorAll<HTMLElement>('[data-print-page]')
    );
    let bestPage = 1;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const node of pageNodes) {
      const rect = node.getBoundingClientRect();
      const pageNum = Number(node.getAttribute('data-print-page') || '1');
      if (rect.top <= targetY && rect.bottom >= targetY) {
        bestPage = pageNum;
        break;
      }
      const dist = Math.min(Math.abs(rect.top - targetY), Math.abs(rect.bottom - targetY));
      if (dist < bestDist) {
        bestDist = dist;
        bestPage = pageNum;
      }
    }

    setCurrentPage(bestPage);
  }, [pages.length]);

  const handleZoomOut = () => {
    setZoomMode('custom');
    setZoomScale((prev) => {
      const lower = [...ZOOM_STEPS].reverse().find((s) => s < prev - 0.01);
      return lower ?? ZOOM_STEPS[0];
    });
  };

  const handleZoomIn = () => {
    setZoomMode('custom');
    setZoomScale((prev) => {
      const higher = ZOOM_STEPS.find((s) => s > prev + 0.01);
      return higher ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
    });
  };

  const handleFitWidth = () => {
    setZoomMode('fit');
    setZoomScale(1.0);
  };

  const triggerBlobDownload = useCallback(
    (blob: Blob, fileName: string) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 4000);
    },
    []
  );

  const handleDownloadPdf = async () => {
    if (!doc || downloading) return;
    setHighlightDownload(false);
    setDownloading(true);
    try {
      const blob = pdfBlob ?? (await generateDocumentPdfBlob(doc, companyId));
      const fileName = getPrintDocumentFileName(doc);
      triggerBlobDownload(blob, fileName);
      notify.success('PDF downloaded');
    } catch (err) {
      notify.error(
        'Could not download PDF.',
        err instanceof Error ? err.message : 'Try again.'
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    if (!doc || sharing) return;
    setSharing(true);
    try {
      const blob = pdfBlob ?? (await generateDocumentPdfBlob(doc, companyId));
      const fileName = getPrintDocumentFileName(doc);
      const documentName = getPrintDocumentDisplayName(doc);
      const companyName = doc.companyName || 'MK Melting Solutions';
      const file = new File([blob], fileName, { type: 'application/pdf' });

      let canShareFile = false;
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        typeof navigator.share === 'function'
      ) {
        try {
          canShareFile = navigator.canShare({ files: [file] });
        } catch {
          canShareFile = false;
        }
      }

      if (canShareFile) {
        try {
          await navigator.share({
            files: [file],
            title: documentName,
            text: companyName,
          });
        } catch (err) {
          // Ignore when the user simply cancels the share sheet
          if (err instanceof Error && err.name === 'AbortError') {
            return;
          }
          const msg = err instanceof Error ? err.message.toLowerCase() : '';
          if (msg.includes('cancel') || msg.includes('abort')) {
            return;
          }
          throw err;
        }
      } else {
        triggerBlobDownload(blob, fileName);
        notify.info('Sharing is not available on this device. The PDF was downloaded.');
      }
    } catch (err) {
      notify.error(
        'Could not share document.',
        err instanceof Error ? err.message : 'Try again.'
      );
    } finally {
      setSharing(false);
    }
  };

  const handlePrint = async () => {
    if (status !== 'ready' || pages.length === 0) return;

    const printRoot = mountPrintRootWithPages(pages);

    // Ensure all page images in #print-root are decoded before invoking window.print()
    const imgElements = Array.from(printRoot.querySelectorAll('img'));
    await Promise.all(
      imgElements.map((img) =>
        typeof img.decode === 'function' ? img.decode().catch(() => undefined) : Promise.resolve()
      )
    );

    let printDialogOpened = false;
    const markPrintDialogOpened = () => {
      printDialogOpened = true;
    };

    const handleAfterPrint = () => {
      window.removeEventListener('beforeprint', markPrintDialogOpened);
      window.removeEventListener('blur', markPrintDialogOpened);
      removeExistingPrintRoot();
    };

    window.addEventListener('beforeprint', markPrintDialogOpened, { once: true });
    window.addEventListener('blur', markPrintDialogOpened, { once: true });
    window.addEventListener('afterprint', handleAfterPrint, { once: true });

    let printThrew = false;
    try {
      window.print();
    } catch {
      printThrew = true;
    }

    if (printThrew) {
      window.removeEventListener('beforeprint', markPrintDialogOpened);
      window.removeEventListener('blur', markPrintDialogOpened);
      window.removeEventListener('afterprint', handleAfterPrint);
      removeExistingPrintRoot();
      setHighlightDownload(true);
      notify.info(
        'Printing is blocked here. Use Download PDF, or open the app in its own browser window to print'
      );
      return;
    }

    // Check if window.print() was silently blocked (e.g. inside a sandboxed preview frame without allow-modals)
    window.setTimeout(() => {
      window.removeEventListener('beforeprint', markPrintDialogOpened);
      window.removeEventListener('blur', markPrintDialogOpened);

      if (!printDialogOpened && document.hasFocus()) {
        window.removeEventListener('afterprint', handleAfterPrint);
        removeExistingPrintRoot();
        setHighlightDownload(true);
        notify.info(
          'Printing is blocked here. Use Download PDF, or open the app in its own browser window to print'
        );
      }
    }, 250);
  };

  if (!open || !doc) return null;

  const documentDisplayName = getPrintDocumentDisplayName(doc);
  const totalPages = pages.length || 1;
  const canZoomOut = status === 'ready' && zoomScale > ZOOM_STEPS[0] + 0.01;
  const canZoomIn =
    status === 'ready' && zoomScale < ZOOM_STEPS[ZOOM_STEPS.length - 1] - 0.01;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-dialog-title"
      className="fixed inset-0 z-[85] flex items-center justify-center sm:p-4 no-print"
    >
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={() => {
          removeExistingPrintRoot();
          onClose();
        }}
        className="fixed inset-0 bg-[var(--text)]/40 backdrop-blur-[2px]"
      />

      {/* Dialog Panel: full screen on mobile, wide premium modal with glow on desktop */}
      <div
        ref={panelRef}
        className={cn(
          'relative z-10 flex flex-col w-full bg-[var(--bg)] border border-[var(--border)] shadow-pop glow-popup overflow-hidden',
          'h-[100dvh] max-h-[100dvh] rounded-none',
          'sm:h-[90dvh] sm:max-h-[90dvh] sm:max-w-4xl sm:rounded-[16px]'
        )}
      >
        {/* Header: small icon chip, title "Print", document name underneath, visible X top-right */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-[var(--border)] bg-[var(--bg)] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-[10px] bg-[var(--brand-soft)] text-[var(--brand)] inline-flex items-center justify-center shrink-0">
              <Printer className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="print-dialog-title"
                className="font-heading text-base sm:text-lg font-semibold text-[var(--text)] leading-tight"
              >
                Print
              </h2>
              <p className="text-xs text-[var(--text-muted)] truncate mt-0.5 tabular-nums">
                {documentDisplayName}
              </p>
            </div>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            onClick={() => {
              removeExistingPrintRoot();
              onClose();
            }}
            aria-label="Close dialog"
            className="h-10 w-10 rounded-[10px] inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-subtle)] transition-colors shrink-0 cursor-pointer focus-ring"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Small Toolbar at the top of the body: "Page 1 of 3", zoom out, zoom in, and "Fit width" */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-2.5 border-b border-[var(--border)] bg-[var(--surface-subtle)] shrink-0">
          <div className="text-xs font-medium text-[var(--text)] tabular-nums">
            {status === 'ready'
              ? `Page ${currentPage} of ${totalPages}`
              : status === 'preparing'
                ? 'Preparing pages…'
                : 'Preview unavailable'}
          </div>

          <div className="flex items-center gap-1.5">
            <ToolbarIconButton
              onClick={handleZoomOut}
              disabled={!canZoomOut}
              ariaLabel="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </ToolbarIconButton>

            <span className="min-w-[3.25rem] text-center text-xs font-medium text-[var(--text-muted)] tabular-nums select-none">
              {Math.round(zoomScale * 100)}%
            </span>

            <ToolbarIconButton
              onClick={handleZoomIn}
              disabled={!canZoomIn}
              ariaLabel="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </ToolbarIconButton>

            <button
              ref={fitBtnRef}
              type="button"
              disabled={status !== 'ready'}
              onClick={handleFitWidth}
              className={cn(
                'h-8 px-2.5 rounded-[8px] inline-flex items-center gap-1.5 text-xs font-medium border transition-colors cursor-pointer disabled:opacity-45 disabled:pointer-events-none focus-ring',
                zoomMode === 'fit'
                  ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)] font-semibold'
                  : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--surface-subtle)]'
              )}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>Fit width</span>
            </button>
          </div>
        </div>

        {/* Body: soft grey canvas with stacked white A4 sheets */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-auto overscroll-contain bg-[#F1EEF0]"
        >
          {status === 'preparing' && (
            <div className="flex h-full min-h-[320px] items-center justify-center p-6">
              <BrandLoader
                size="sm"
                variant="section"
                label="Preparing document"
                labelDelayMs={0}
                companyId={companyId}
              />
            </div>
          )}

          {status === 'error' && (
            <div className="flex h-full min-h-[320px] items-center justify-center p-6">
              <div className="max-w-md w-full rounded-[16px] border border-[var(--danger-border)] bg-[var(--bg)] p-6 text-center shadow-soft space-y-3">
                <div className="mx-auto h-10 w-10 rounded-full bg-[var(--danger-bg)] text-[var(--danger)] flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <h3 className="font-heading text-sm font-semibold text-[var(--text)]">
                  Could not prepare document preview
                </h3>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  {errorMessage ||
                    'An error occurred while rendering the PDF preview. Retry or download the PDF directly.'}
                </p>
                <div className="pt-1 flex items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setRetryTick((t) => t + 1)}
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Retry</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {status === 'ready' && pages.length > 0 && (
            <div
              ref={pagesWrapperRef}
              className="flex flex-col items-center gap-5 p-4 sm:p-6 min-w-fit"
            >
              {pages.map((page) => {
                const customWidthPx = Math.round(BASE_FIT_MAX_WIDTH * zoomScale);
                return (
                  <div
                    key={page.pageNumber}
                    data-print-page={page.pageNumber}
                    style={
                      zoomMode === 'fit'
                        ? {
                            width: '100%',
                            maxWidth: `${BASE_FIT_MAX_WIDTH}px`,
                            aspectRatio: '210 / 297',
                          }
                        : {
                            width: `${customWidthPx}px`,
                            maxWidth: 'none',
                            aspectRatio: '210 / 297',
                          }
                    }
                    className="bg-white rounded-[4px] border border-[#E2D9DF] shadow-[0_6px_24px_rgba(30,21,25,0.12)] overflow-hidden shrink-0 select-none"
                  >
                    <img
                      src={page.dataUrl}
                      alt={`${documentDisplayName} — Page ${page.pageNumber}`}
                      className="block w-full h-full object-contain pointer-events-none"
                      draggable={false}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer: Share (secondary), Download PDF (secondary), Print (primary, gradient) */}
        <div className="border-t border-[var(--border)] bg-[var(--bg)] px-4 sm:px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shrink-0">
          <div className="grid grid-cols-3 gap-2 w-full sm:flex sm:w-auto sm:items-center sm:justify-end sm:gap-2.5">
            <Button
              type="button"
              variant="secondary"
              size="md"
              loading={sharing}
              disabled={status !== 'ready' || sharing || downloading}
              onClick={() => void handleShare()}
              className="w-full sm:w-auto px-2.5 sm:px-4 text-xs sm:text-sm"
            >
              <Share2 className="h-4 w-4 shrink-0" />
              <span>Share</span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="md"
              loading={downloading}
              disabled={status === 'preparing' || sharing || downloading}
              onClick={() => void handleDownloadPdf()}
              className={cn(
                'w-full sm:w-auto px-2.5 sm:px-4 text-xs sm:text-sm transition-all',
                highlightDownload &&
                  'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)] font-semibold ring-2 ring-[var(--brand)]/35 shadow-soft'
              )}
            >
              <Download className="h-4 w-4 shrink-0" />
              <span>Download PDF</span>
            </Button>

            <Button
              ref={printBtnRef}
              type="button"
              variant="primary"
              size="md"
              disabled={status !== 'ready' || sharing || downloading}
              onClick={() => void handlePrint()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && status === 'ready') {
                  e.preventDefault();
                  void handlePrint();
                }
              }}
              className="w-full sm:w-auto px-2.5 sm:px-5 text-xs sm:text-sm"
            >
              <Printer className="h-4 w-4 shrink-0" />
              <span>Print</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
