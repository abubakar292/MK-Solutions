import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from '@react-pdf/renderer';
import { Download, Printer } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { BrandLogo, getLogoBase64DataUrl } from '../../lib/brand';
import { notify } from '../../lib/notify';
import { BrandLoader } from '../loader/BrandLoader';
import { Button } from '../ui/Button';
import {
  PrintPreviewDialog,
  getPrintDocumentDisplayName,
  getPrintDocumentFileName,
} from './PrintPreviewDialog';

export { PrintPreviewDialog, getPrintDocumentDisplayName, getPrintDocumentFileName };

export interface PrintableDocumentSection {
  title: string;
  columns: Array<{ key: string; header: string; align?: 'left' | 'right' }>;
  rows: Array<Record<string, string | number>>;
}

export interface PrintableOverviewBlock {
  title: string;
  caption: string;
  formula?: string;
  columns: Array<{
    key: string;
    header: string;
    align?: 'left' | 'right';
    widthPercent?: number;
  }>;
  rows: Array<{
    values: Record<string, string | number>;
    variant?: 'normal' | 'detail' | 'subtotal' | 'highlighted';
    indent?: boolean;
  }>;
}

export interface PrintableOverviewLayout {
  summaryStrip: Array<{
    label: string;
    sublabel?: string;
    value: string;
  }>;
  blocks: PrintableOverviewBlock[];
  grandTotalBar?: {
    label: string;
    details?: string;
    value: string;
  };
  checkLine?: {
    isConsistent: boolean;
    text: string;
    warningText?: string;
  };
}

export interface PrintableDocumentMeta {
  title: string;
  docNumber?: string;
  date?: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  partyLabel?: string;
  partyName?: string;
  partyAddress?: string;
  metaRows?: Array<{ label: string; value: string }>;
  columns: Array<{ key: string; header: string; align?: 'left' | 'right' }>;
  rows: Array<Record<string, string | number>>;
  extraSections?: PrintableDocumentSection[];
  totals?: Array<{ label: string; value: string; highlight?: boolean }>;
  amountInWordsText?: string;
  overviewLayout?: PrintableOverviewLayout;
}

/**
 * Global preparation listener so any call to downloadDocumentPdf shows
 * BrandLoader (size="sm", variant="overlay", label="Preparing document") per D1.2 & D9,
 * and allows download buttons across the app to disable themselves while preparing.
 */
let activePrepCount = 0;
const prepListeners = new Set<(preparing: boolean) => void>();

export function setDocumentPreparing(active: boolean) {
  activePrepCount = Math.max(0, activePrepCount + (active ? 1 : -1));
  const isPreparing = activePrepCount > 0;
  for (const listener of prepListeners) {
    listener(isPreparing);
  }
}

export function isDocumentPreparing(): boolean {
  return activePrepCount > 0;
}

export function useDocumentPreparing(): boolean {
  const [preparing, setPreparing] = useState<boolean>(() => activePrepCount > 0);

  useEffect(() => {
    setPreparing(activePrepCount > 0);
    const handler = (state: boolean) => setPreparing(state);
    prepListeners.add(handler);
    return () => {
      prepListeners.delete(handler);
    };
  }, []);

  return preparing;
}

interface PrintPreviewGlobalState {
  open: boolean;
  doc: PrintableDocumentMeta | null;
  companyId?: string;
}

let currentPrintPreviewState: PrintPreviewGlobalState = {
  open: false,
  doc: null,
  companyId: undefined,
};
const previewListeners = new Set<(state: PrintPreviewGlobalState) => void>();

export function openPrintPreviewDialog(
  doc: PrintableDocumentMeta,
  companyId?: string
): void {
  currentPrintPreviewState = {
    open: true,
    doc,
    companyId,
  };
  for (const listener of previewListeners) {
    listener(currentPrintPreviewState);
  }
}

export function closePrintPreviewDialog(): void {
  currentPrintPreviewState = {
    open: false,
    doc: null,
    companyId: undefined,
  };
  for (const listener of previewListeners) {
    listener(currentPrintPreviewState);
  }
}

export const DocumentPrepOverlay: React.FC = () => {
  const preparing = useDocumentPreparing();
  const [previewState, setPreviewState] = useState<PrintPreviewGlobalState>(
    () => currentPrintPreviewState
  );

  useEffect(() => {
    setPreviewState(currentPrintPreviewState);
    const handler = (state: PrintPreviewGlobalState) => setPreviewState(state);
    previewListeners.add(handler);
    return () => {
      previewListeners.delete(handler);
    };
  }, []);

  return (
    <>
      {preparing && !previewState.open && (
        <BrandLoader
          size="sm"
          variant="overlay"
          label="Preparing document"
          labelDelayMs={0}
        />
      )}
      <PrintPreviewDialog
        open={previewState.open}
        onClose={closePrintPreviewDialog}
        doc={previewState.doc}
        companyId={previewState.companyId}
      />
    </>
  );
};

function getPdfStyles() {
  const bg = '#FFFFFF';
  const text = '#1E1519';
  const textMuted = '#665C61';
  const brand = '#E00000';
  const brandSoft = '#FFF2F2';
  const border = '#E6DCE0';
  const surfaceSubtle = '#F9F6F7';

  return {
    colors: { bg, text, textMuted, brand, brandSoft, border, surfaceSubtle },
    styles: StyleSheet.create({
      page: {
        paddingTop: 28,
        paddingBottom: 40,
        paddingHorizontal: 32,
        backgroundColor: bg,
        color: text,
        fontFamily: 'Helvetica',
        fontSize: 9,
      },
      header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1.5,
        borderBottomColor: brand,
        paddingBottom: 10,
        marginBottom: 12,
      },
      brandLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      },
      logo: {
        width: 40,
        height: 40,
        objectFit: 'contain',
      },
      companyTitle: {
        fontSize: 13.5,
        fontFamily: 'Helvetica-Bold',
        color: text,
      },
      companySub: {
        fontSize: 8,
        color: textMuted,
        marginTop: 1.5,
      },
      docTitleRight: {
        textAlign: 'right',
        maxWidth: 230,
      },
      docTitleText: {
        fontSize: 13,
        fontFamily: 'Helvetica-Bold',
        color: brand,
      },
      docMetaText: {
        fontSize: 8.5,
        color: textMuted,
        marginTop: 2,
      },
      infoGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
        gap: 12,
      },
      infoBlock: {
        flex: 1,
        padding: 8,
        borderWidth: 1,
        borderColor: border,
        borderRadius: 4,
      },
      infoLabel: {
        fontSize: 8,
        color: textMuted,
        marginBottom: 2,
      },
      infoValue: {
        fontSize: 9.5,
        fontFamily: 'Helvetica-Bold',
        color: text,
      },
      sectionTitle: {
        fontSize: 10,
        fontFamily: 'Helvetica-Bold',
        color: brand,
        marginTop: 14,
        marginBottom: 6,
      },
      tableHeader: {
        flexDirection: 'row',
        backgroundColor: surfaceSubtle,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: brand,
        paddingVertical: 5.5,
        paddingHorizontal: 6,
      },
      tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: border,
        paddingVertical: 5,
        paddingHorizontal: 6,
      },
      cell: {
        flex: 1,
        fontSize: 8.5,
        paddingRight: 4,
      },
      cellRight: {
        flex: 1,
        fontSize: 8.5,
        textAlign: 'right',
        paddingLeft: 4,
      },
      totalsArea: {
        marginTop: 12,
        alignItems: 'flex-end',
      },
      totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: 230,
        paddingVertical: 3,
      },
      totalHighlight: {
        borderTopWidth: 1,
        borderTopColor: brand,
        paddingTop: 5,
        marginTop: 3,
      },
      wordsBox: {
        marginTop: 12,
        padding: 8,
        backgroundColor: surfaceSubtle,
        borderWidth: 1,
        borderColor: border,
        borderRadius: 4,
        fontSize: 8.5,
      },
      signatureRow: {
        marginTop: 22,
        flexDirection: 'row',
        justifyContent: 'space-between',
      },
      signatureBlock: {
        width: 150,
        borderTopWidth: 1,
        borderTopColor: border,
        paddingTop: 4,
        textAlign: 'center',
        fontSize: 8,
        color: textMuted,
      },
      pageNumber: {
        position: 'absolute',
        fontSize: 8,
        bottom: 16,
        left: 32,
        right: 32,
        textAlign: 'center',
        color: textMuted,
      },
    }),
  };
}

const PdfDocumentTemplate: React.FC<{
  doc: PrintableDocumentMeta;
  logoDataUrl: string;
}> = ({ doc, logoDataUrl }) => {
  const { styles: pdfStyles, colors } = getPdfStyles();
  const contactLine = [doc.companyPhone, doc.companyEmail].filter(Boolean).join(' · ');

  return (
    <Document title={`${doc.title} ${doc.docNumber || ''}`.trim()}>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          <View style={pdfStyles.brandLeft}>
            {logoDataUrl ? <Image src={logoDataUrl} style={pdfStyles.logo} /> : null}
            <View>
              <Text style={pdfStyles.companyTitle}>
                {doc.companyName || 'MK Melting Solutions'}
              </Text>
              {doc.companyAddress ? (
                <Text style={pdfStyles.companySub}>{doc.companyAddress}</Text>
              ) : null}
              {contactLine ? (
                <Text style={pdfStyles.companySub}>{contactLine}</Text>
              ) : null}
            </View>
          </View>
          <View style={pdfStyles.docTitleRight}>
            <Text style={pdfStyles.docTitleText}>{doc.title}</Text>
            {doc.docNumber ? (
              <Text
                style={[
                  pdfStyles.docMetaText,
                  { color: colors.text, fontFamily: 'Helvetica-Bold' },
                ]}
              >
                {doc.docNumber}
              </Text>
            ) : null}
            {doc.date ? <Text style={pdfStyles.docMetaText}>{doc.date}</Text> : null}
          </View>
        </View>

        {doc.overviewLayout ? (
          <View>
            {/* Summary strip (3 to 4 small boxes) */}
            <View
              style={{
                flexDirection: 'row',
                gap: 8,
                marginBottom: 10,
              }}
              wrap={false}
            >
              {doc.overviewLayout.summaryStrip.map((box, idx) => (
                <View
                  key={idx}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 5,
                    paddingVertical: 6,
                    paddingHorizontal: 8,
                    backgroundColor: colors.bg,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 7.5,
                      color: colors.textMuted,
                    }}
                  >
                    {box.label}
                  </Text>
                  {box.sublabel ? (
                    <Text
                      style={{
                        fontSize: 6.5,
                        color: colors.textMuted,
                        marginTop: 0.5,
                      }}
                    >
                      {box.sublabel}
                    </Text>
                  ) : null}
                  <Text
                    style={{
                      fontSize: 10.5,
                      fontFamily: 'Helvetica-Bold',
                      color: colors.text,
                      marginTop: 3,
                    }}
                  >
                    {box.value}
                  </Text>
                </View>
              ))}
            </View>

            {/* Grouped report blocks */}
            {doc.overviewLayout.blocks.map((block, bIdx) => {
              const keepBlockTogether = block.rows.length <= 8;
              return (
                <View
                  key={bIdx}
                  wrap={!keepBlockTogether}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 5,
                    marginBottom: 8,
                    overflow: 'hidden',
                  }}
                >
                  {/* Heading band (section/group name appears once) */}
                  <View
                    wrap={false}
                    style={{
                      paddingVertical: 5,
                      paddingHorizontal: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                      backgroundColor: colors.surfaceSubtle,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <View>
                      <Text
                        style={{
                          fontSize: 9.5,
                          fontFamily: 'Helvetica-Bold',
                          color: colors.brand,
                        }}
                      >
                        {block.title}
                      </Text>
                      <Text
                        style={{
                          fontSize: 7.5,
                          color: colors.textMuted,
                          marginTop: 1,
                        }}
                      >
                        {block.caption}
                      </Text>
                    </View>
                    {block.formula ? (
                      <Text
                        style={{
                          fontSize: 7.5,
                          color: colors.textMuted,
                        }}
                      >
                        {block.formula}
                      </Text>
                    ) : null}
                  </View>

                  {/* Table column headers — red header text, repeats on each page if block spans pages */}
                  <View
                    fixed={!keepBlockTogether}
                    wrap={false}
                    style={{
                      flexDirection: 'row',
                      borderBottomWidth: 1,
                      borderBottomColor: colors.brand,
                      paddingVertical: 4.5,
                      paddingHorizontal: 8,
                      backgroundColor: colors.bg,
                    }}
                  >
                    {block.columns.map((col) => (
                      <Text
                        key={col.key}
                        style={{
                          width: col.widthPercent ? `${col.widthPercent}%` : undefined,
                          flex: col.widthPercent ? undefined : 1,
                          fontSize: 7.5,
                          fontFamily: 'Helvetica-Bold',
                          color: colors.brand,
                          textAlign: col.align === 'right' ? 'right' : 'left',
                        }}
                      >
                        {col.header}
                      </Text>
                    ))}
                  </View>

                  {/* Table rows (no zebra shading; rows never split across pages; no red for numbers) */}
                  {block.rows.map((row, rIdx) => {
                    const isHighlighted = row.variant === 'highlighted';
                    const isSubtotal = row.variant === 'subtotal';
                    const isDetail = row.variant === 'detail';
                    const isLast = rIdx === block.rows.length - 1;
                    return (
                      <View
                        key={rIdx}
                        wrap={false}
                        style={{
                          flexDirection: 'row',
                          paddingVertical: isHighlighted ? 5 : isDetail ? 3.5 : 4.2,
                          paddingHorizontal: 8,
                          borderTopWidth: isHighlighted ? 1 : isSubtotal ? 0.75 : 0,
                          borderTopColor: isHighlighted ? colors.brand : colors.border,
                          borderBottomWidth: isLast ? 0 : 0.5,
                          borderBottomColor: colors.border,
                          backgroundColor: isHighlighted
                            ? colors.brandSoft
                            : isSubtotal
                              ? colors.surfaceSubtle
                              : colors.bg,
                        }}
                      >
                        {block.columns.map((col, cIdx) => {
                          const cellVal = String(row.values[col.key] ?? '');
                          const isFirstCol = cIdx === 0;
                          return (
                            <Text
                              key={col.key}
                              style={{
                                width: col.widthPercent ? `${col.widthPercent}%` : undefined,
                                flex: col.widthPercent ? undefined : 1,
                                paddingLeft: isFirstCol && row.indent ? 12 : 0,
                                fontSize: isHighlighted ? 8.5 : isDetail ? 7.5 : 8,
                                fontFamily:
                                  isHighlighted || isSubtotal
                                    ? 'Helvetica-Bold'
                                    : 'Helvetica',
                                color: isDetail ? colors.textMuted : colors.text,
                                textAlign: col.align === 'right' ? 'right' : 'left',
                              }}
                            >
                              {cellVal}
                            </Text>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              );
            })}

            {/* Optional Grand Total bar for multi-group reports */}
            {doc.overviewLayout.grandTotalBar ? (
              <View
                wrap={false}
                style={{
                  marginTop: 2,
                  marginBottom: doc.overviewLayout.checkLine ? 6 : 0,
                  paddingVertical: 6.5,
                  paddingHorizontal: 10,
                  borderWidth: 1.2,
                  borderColor: colors.brand,
                  borderRadius: 5,
                  backgroundColor: colors.brandSoft,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View>
                  <Text
                    style={{
                      fontSize: 9,
                      fontFamily: 'Helvetica-Bold',
                      color: colors.text,
                    }}
                  >
                    {doc.overviewLayout.grandTotalBar.label}
                  </Text>
                  {doc.overviewLayout.grandTotalBar.details ? (
                    <Text
                      style={{
                        fontSize: 7.5,
                        color: colors.textMuted,
                        marginTop: 1,
                      }}
                    >
                      {doc.overviewLayout.grandTotalBar.details}
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={{
                    fontSize: 10.5,
                    fontFamily: 'Helvetica-Bold',
                    color: colors.text,
                  }}
                >
                  {doc.overviewLayout.grandTotalBar.value}
                </Text>
              </View>
            ) : null}

            {/* Optional Check line at the bottom */}
            {doc.overviewLayout.checkLine ? (
              <View
                wrap={false}
                style={{
                  marginTop: 2,
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  borderWidth: 1,
                  borderColor: doc.overviewLayout.checkLine.isConsistent
                    ? colors.border
                    : colors.brand,
                  borderRadius: 5,
                  backgroundColor: colors.surfaceSubtle,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 8,
                    fontFamily: 'Helvetica-Bold',
                    color: colors.text,
                  }}
                >
                  {doc.overviewLayout.checkLine.isConsistent ? '[OK] ' : '[!] '}
                  {doc.overviewLayout.checkLine.text}
                </Text>
                {!doc.overviewLayout.checkLine.isConsistent &&
                doc.overviewLayout.checkLine.warningText ? (
                  <Text
                    style={{
                      fontSize: 7.5,
                      fontFamily: 'Helvetica-Bold',
                      color: colors.brand,
                    }}
                  >
                    {doc.overviewLayout.checkLine.warningText}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : (
          <>
            {(doc.partyName || (doc.metaRows && doc.metaRows.length > 0)) && (
              <View style={pdfStyles.infoGrid}>
                {doc.partyName ? (
                  <View style={pdfStyles.infoBlock}>
                    <Text style={pdfStyles.infoLabel}>{doc.partyLabel || 'Customer'}</Text>
                    <Text style={pdfStyles.infoValue}>{doc.partyName}</Text>
                    {doc.partyAddress ? (
                      <Text style={pdfStyles.companySub}>{doc.partyAddress}</Text>
                    ) : null}
                  </View>
                ) : null}
                {doc.metaRows && doc.metaRows.length > 0 ? (
                  <View style={pdfStyles.infoBlock}>
                    {doc.metaRows.map((m, idx) => (
                      <View
                        key={idx}
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          marginBottom: 2,
                          gap: 8,
                        }}
                      >
                        <Text style={pdfStyles.infoLabel}>{m.label}:</Text>
                        <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold' }}>
                          {m.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            )}

            {doc.columns.length > 0 && (
              <>
                <View
                  style={pdfStyles.tableHeader}
                  fixed={!doc.extraSections || doc.extraSections.length === 0}
                >
                  {doc.columns.map((c) => (
                    <Text
                      key={c.key}
                      style={
                        c.align === 'right'
                          ? [
                              pdfStyles.cellRight,
                              { fontFamily: 'Helvetica-Bold', color: colors.brand },
                            ]
                          : [pdfStyles.cell, { fontFamily: 'Helvetica-Bold', color: colors.brand }]
                      }
                    >
                      {c.header}
                    </Text>
                  ))}
                </View>

                {doc.rows.map((r, rIdx) => (
                  <View key={rIdx} style={pdfStyles.tableRow} wrap={false}>
                    {doc.columns.map((c) => (
                      <Text
                        key={c.key}
                        style={c.align === 'right' ? pdfStyles.cellRight : pdfStyles.cell}
                      >
                        {String(r[c.key] ?? '')}
                      </Text>
                    ))}
                  </View>
                ))}
              </>
            )}

            {doc.extraSections &&
              doc.extraSections.map((sec, sIdx) => (
                <View key={sIdx}>
                  <Text style={pdfStyles.sectionTitle} wrap={false}>
                    {sec.title}
                  </Text>
                  <View style={pdfStyles.tableHeader} wrap={false}>
                    {sec.columns.map((c) => (
                      <Text
                        key={c.key}
                        style={
                          c.align === 'right'
                            ? [
                                pdfStyles.cellRight,
                                { fontFamily: 'Helvetica-Bold', color: colors.brand },
                              ]
                            : [
                                pdfStyles.cell,
                                { fontFamily: 'Helvetica-Bold', color: colors.brand },
                              ]
                        }
                      >
                        {c.header}
                      </Text>
                    ))}
                  </View>
                  {sec.rows.length > 0 ? (
                    sec.rows.map((r, rIdx) => (
                      <View key={rIdx} style={pdfStyles.tableRow} wrap={false}>
                        {sec.columns.map((c) => (
                          <Text
                            key={c.key}
                            style={c.align === 'right' ? pdfStyles.cellRight : pdfStyles.cell}
                          >
                            {String(r[c.key] ?? '')}
                          </Text>
                        ))}
                      </View>
                    ))
                  ) : (
                    <View style={pdfStyles.tableRow} wrap={false}>
                      <Text style={[pdfStyles.cell, { color: colors.textMuted }]}>
                        No records in this section.
                      </Text>
                    </View>
                  )}
                </View>
              ))}

            {doc.totals && doc.totals.length > 0 && (
              <View style={pdfStyles.totalsArea} wrap={false}>
                {doc.totals.map((t, idx) => (
                  <View
                    key={idx}
                    style={
                      t.highlight
                        ? [pdfStyles.totalRow, pdfStyles.totalHighlight]
                        : pdfStyles.totalRow
                    }
                  >
                    <Text style={{ fontSize: 8.5, color: colors.textMuted }}>{t.label}</Text>
                    <Text
                      style={{
                        fontSize: t.highlight ? 10.5 : 8.5,
                        fontFamily: 'Helvetica-Bold',
                        color: t.highlight ? colors.brand : colors.text,
                      }}
                    >
                      {t.value}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {doc.amountInWordsText ? (
              <View style={pdfStyles.wordsBox} wrap={false}>
                <Text>Amount in words: {doc.amountInWordsText}</Text>
              </View>
            ) : null}

            <View style={pdfStyles.signatureRow} wrap={false}>
              <View style={pdfStyles.signatureBlock}>
                <Text>Prepared by</Text>
              </View>
              <View style={pdfStyles.signatureBlock}>
                <Text>Authorized signature</Text>
              </View>
            </View>
          </>
        )}

        <Text
          style={pdfStyles.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `${doc.companyName || 'MK Melting Solutions'} · ${doc.title}${
              doc.docNumber ? ` (${doc.docNumber})` : ''
            } · Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
};

/**
 * Generates the exact same PDF blob used by both Download PDF and Print (usePrintDocument).
 */
export async function generateDocumentPdfBlob(
  doc: PrintableDocumentMeta,
  companyId?: string
): Promise<Blob> {
  const logoDataUrl = await getLogoBase64DataUrl(companyId);
  const rawBlob = await pdf(<PdfDocumentTemplate doc={doc} logoDataUrl={logoDataUrl} />).toBlob();
  return new Blob([rawBlob], { type: 'application/pdf' });
}

export async function downloadDocumentPdf(
  doc: PrintableDocumentMeta,
  companyId?: string
): Promise<void> {
  if (isDocumentPreparing()) return;
  setDocumentPreparing(true);
  try {
    const blob = await generateDocumentPdfBlob(doc, companyId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getPrintDocumentFileName(doc);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 5000);
  } finally {
    setDocumentPreparing(false);
  }
}

/**
 * Opens the in-app PrintPreviewDialog (R3) for any document across the app.
 * Never opens a new browser tab or hidden iframe.
 */
export async function printDocumentPdf(
  doc: PrintableDocumentMeta,
  companyId?: string
): Promise<void> {
  openPrintPreviewDialog(doc, companyId);
}

/**
 * Shared hook `usePrintDocument` used by every print button across the app.
 */
export function usePrintDocument() {
  const isPreparing = useDocumentPreparing();

  const printDocument = useCallback(
    async (doc: PrintableDocumentMeta, companyId?: string) => {
      openPrintPreviewDialog(doc, companyId);
    },
    []
  );

  return {
    printDocument,
    isPrinting: isPreparing,
  };
}

const PrintSheetContent: React.FC<{
  doc: PrintableDocumentMeta;
  companyId?: string;
  children?: React.ReactNode;
}> = ({ doc, companyId, children }) => {
  const contactLine = [doc.companyPhone, doc.companyEmail].filter(Boolean).join(' · ');

  return (
    <div className="mk-a4-sheet rounded-[16px] border border-[var(--border)] bg-[var(--bg)] p-5 sm:p-8 space-y-5 text-[var(--text)] shadow-soft">
      {/* Branded Document Header with Accent Rule */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b-2 border-[var(--brand)]">
        <div className="space-y-1">
          <BrandLogo
            size="lg"
            showText={true}
            companyName={doc.companyName || 'MK Melting Solutions'}
            companyId={companyId}
          />
          {doc.companyAddress && (
            <p className="text-xs text-[var(--text-muted)] pl-0.5">{doc.companyAddress}</p>
          )}
          {contactLine && (
            <p className="text-xs text-[var(--text-muted)] pl-0.5 tabular-nums">{contactLine}</p>
          )}
        </div>
        <div className="sm:text-right space-y-0.5">
          <h2 className="font-heading text-lg font-semibold text-[var(--brand)]">{doc.title}</h2>
          {doc.docNumber && (
            <p className="text-xs font-semibold text-[var(--text)] tabular-nums">{doc.docNumber}</p>
          )}
          {doc.date && <p className="text-xs text-[var(--text-muted)] tabular-nums">{doc.date}</p>}
        </div>
      </div>

      {children ? (
        children
      ) : doc.overviewLayout ? (
        <div className="space-y-4">
          {/* Summary strip (3 to 4 small boxes) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 break-inside-avoid">
            {doc.overviewLayout.summaryStrip.map((box, idx) => (
              <div
                key={idx}
                className="rounded-[10px] border border-[var(--border)] bg-[var(--bg)] p-3 min-w-0"
              >
                <div className="text-[11px] font-medium text-[var(--text-muted)]">
                  {box.label}
                </div>
                {box.sublabel && (
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {box.sublabel}
                  </div>
                )}
                <div className="mt-1 font-heading text-sm sm:text-base font-bold text-[var(--text)] tabular-nums break-words">
                  {box.value}
                </div>
              </div>
            ))}
          </div>

          {/* Grouped blocks */}
          <div className="space-y-4">
            {doc.overviewLayout.blocks.map((block, bIdx) => (
              <div
                key={bIdx}
                className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] overflow-hidden break-inside-avoid flex flex-col"
              >
                <div className="border-b border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-2.5 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h3 className="font-heading text-sm font-semibold text-[var(--brand)]">
                      {block.title}
                    </h3>
                    {block.caption && (
                      <p className="text-xs text-[var(--text-muted)]">{block.caption}</p>
                    )}
                  </div>
                  {block.formula && (
                    <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                      {block.formula}
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto flex-1">
                  <table className="w-full border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
                        {block.columns.map((col) => (
                          <th
                            key={col.key}
                            className={`px-3.5 py-2 text-[11px] font-semibold text-[var(--brand)] ${
                              col.align === 'right' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {col.header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {block.rows.map((row, rIdx) => {
                        const isHighlighted = row.variant === 'highlighted';
                        const isSubtotal = row.variant === 'subtotal';
                        const isDetail = row.variant === 'detail';
                        return (
                          <tr
                            key={rIdx}
                            className={
                              isHighlighted
                                ? 'border-t border-[var(--brand)] bg-[var(--brand-soft)] font-heading font-semibold text-[var(--text)]'
                                : isSubtotal
                                  ? 'bg-[var(--surface-subtle)] font-semibold text-[var(--text)]'
                                  : isDetail
                                    ? 'text-[var(--text-muted)] text-xs'
                                    : 'text-[var(--text)]'
                            }
                          >
                            {block.columns.map((col, cIdx) => (
                              <td
                                key={col.key}
                                className={`px-3.5 py-2.5 ${
                                  cIdx === 0 && (row.indent || isDetail) ? 'pl-7' : ''
                                } ${
                                  col.align === 'right'
                                    ? 'text-right tabular-nums'
                                    : 'text-left'
                                }`}
                              >
                                {row.values[col.key]}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {/* Grand total bar when present */}
          {doc.overviewLayout.grandTotalBar && (
            <div className="rounded-[10px] border border-[var(--brand)] bg-[var(--brand-soft)] px-4 py-3 flex flex-wrap items-center justify-between gap-2 break-inside-avoid">
              <div>
                <div className="font-heading text-sm font-bold text-[var(--text)]">
                  {doc.overviewLayout.grandTotalBar.label}
                </div>
                {doc.overviewLayout.grandTotalBar.details && (
                  <div className="text-xs text-[var(--text-muted)] tabular-nums">
                    {doc.overviewLayout.grandTotalBar.details}
                  </div>
                )}
              </div>
              <div className="font-heading text-base font-bold text-[var(--text)] tabular-nums">
                {doc.overviewLayout.grandTotalBar.value}
              </div>
            </div>
          )}

          {/* Check line at the bottom when present */}
          {doc.overviewLayout.checkLine && (
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-2.5 text-xs sm:text-sm font-medium text-[var(--text)] flex flex-wrap items-center justify-between gap-2 break-inside-avoid">
              <span className="tabular-nums">
                {doc.overviewLayout.checkLine.isConsistent ? '✓ ' : '⚠ '}
                {doc.overviewLayout.checkLine.text}
              </span>
              {!doc.overviewLayout.checkLine.isConsistent &&
                doc.overviewLayout.checkLine.warningText && (
                  <span className="font-semibold text-[var(--brand)]">
                    {doc.overviewLayout.checkLine.warningText}
                  </span>
                )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Party & Document Metadata Grid */}
          {(doc.partyName || (doc.metaRows && doc.metaRows.length > 0)) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {doc.partyName && (
                <div className="rounded-[10px] border border-[var(--border)] p-3.5 space-y-1">
                  <span className="text-xs text-[var(--text-muted)] block">
                    {doc.partyLabel || 'Customer'}
                  </span>
                  <p className="font-semibold text-[var(--text)] text-sm">{doc.partyName}</p>
                  {doc.partyAddress && (
                    <p className="text-xs text-[var(--text-muted)]">{doc.partyAddress}</p>
                  )}
                </div>
              )}

              {doc.metaRows && doc.metaRows.length > 0 && (
                <div className="rounded-[10px] border border-[var(--border)] p-3.5 space-y-1.5">
                  {doc.metaRows.map((m, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="text-[var(--text-muted)]">{m.label}</span>
                      <span className="font-semibold text-[var(--text)] tabular-nums text-right">
                        {m.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Main Document / Report Table */}
          {doc.columns.length > 0 && (
            <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[var(--surface-subtle)] border-y border-[var(--brand)]">
                    {doc.columns.map((c) => (
                      <th
                        key={c.key}
                        className={`px-3 py-2.5 text-xs font-semibold text-[var(--brand)] ${
                          c.align === 'right' ? 'text-right' : 'text-left'
                        }`}
                      >
                        {c.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {doc.rows.map((r, idx) => (
                    <tr key={idx} className="break-inside-avoid">
                      {doc.columns.map((c) => (
                        <td
                          key={c.key}
                          className={`px-3 py-2 text-xs text-[var(--text)] ${
                            c.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                          }`}
                        >
                          {r[c.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Extra Sections (for multi-section reports) */}
          {doc.extraSections &&
            doc.extraSections.map((sec, sIdx) => (
              <div key={sIdx} className="space-y-2 break-inside-avoid">
                <h3 className="font-heading text-xs font-bold text-[var(--brand)]">
                  {sec.title}
                </h3>
                <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-[var(--surface-subtle)] border-y border-[var(--brand)]">
                        {sec.columns.map((c) => (
                          <th
                            key={c.key}
                            className={`px-3 py-2 text-xs font-semibold text-[var(--brand)] ${
                              c.align === 'right' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {c.header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {sec.rows.map((r, rIdx) => (
                        <tr key={rIdx} className="break-inside-avoid">
                          {sec.columns.map((c) => (
                            <td
                              key={c.key}
                              className={`px-3 py-2 text-xs text-[var(--text)] ${
                                c.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                              }`}
                            >
                              {r[c.key]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

          {/* Totals and Amount in Words */}
          {(doc.amountInWordsText || (doc.totals && doc.totals.length > 0)) && (
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-2 break-inside-avoid">
              <div className="max-w-md">
                {doc.amountInWordsText && (
                  <p className="rounded-[10px] bg-[var(--surface-subtle)] border border-[var(--border)] px-3 py-2 text-xs text-[var(--text)]">
                    <span className="text-[var(--text-muted)]">Amount in words: </span>
                    <span className="font-medium">{doc.amountInWordsText}</span>
                  </p>
                )}
              </div>

              {doc.totals && doc.totals.length > 0 && (
                <div className="w-full sm:w-72 space-y-1.5 text-sm ml-auto">
                  {doc.totals.map((t, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between py-1 ${
                        t.highlight
                          ? 'border-t border-[var(--brand)] pt-2 font-heading font-bold text-[var(--brand)]'
                          : 'text-xs text-[var(--text)]'
                      }`}
                    >
                      <span
                        className={t.highlight ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}
                      >
                        {t.label}
                      </span>
                      <span className="tabular-nums font-semibold">{t.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-8 text-xs text-[var(--text-muted)] break-inside-avoid">
            <div className="border-t border-[var(--border)] pt-2 text-center">
              Prepared by
            </div>
            <div className="border-t border-[var(--border)] pt-2 text-center">
              Authorized signature
            </div>
          </div>
        </div>
      )}

      {/* Print Page Footer */}
      <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-muted)] break-inside-avoid">
        <span>
          {doc.companyName || 'MK Melting Solutions'} — {doc.title}
          {doc.docNumber ? ` (${doc.docNumber})` : ''}
        </span>
        <span className="tabular-nums">{doc.date || ''}</span>
      </div>
    </div>
  );
};

interface PrintLayoutProps {
  doc: PrintableDocumentMeta;
  companyId?: string;
  children?: React.ReactNode;
}

/**
 * Dedicated PrintLayout component with working Print (opens PrintPreviewDialog) and Download PDF actions.
 */
export const PrintLayout: React.FC<PrintLayoutProps> = ({ doc, companyId, children }) => {
  const [downloading, setDownloading] = useState(false);
  const { printDocument, isPrinting } = usePrintDocument();

  const handleDownloadPdf = async () => {
    if (isPrinting || downloading) return;
    setDownloading(true);
    try {
      await downloadDocumentPdf(doc, companyId);
      notify.success('PDF downloaded');
    } catch (err) {
      notify.error(
        'Could not generate PDF file.',
        err instanceof Error ? err.message : 'Try again.'
      );
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = async () => {
    if (isPrinting || downloading) return;
    await printDocument(doc, companyId);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2 no-print">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isPrinting || downloading}
          onClick={handlePrint}
        >
          <Printer className="h-4 w-4" />
          <span>Print</span>
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          loading={downloading}
          disabled={isPrinting || downloading}
          onClick={handleDownloadPdf}
        >
          <Download className="h-4 w-4" />
          <span>Download PDF</span>
        </Button>
      </div>

      {/* On-screen Interactive Preview Sheet */}
      <PrintSheetContent doc={doc} companyId={companyId}>
        {children}
      </PrintSheetContent>
    </div>
  );
};
