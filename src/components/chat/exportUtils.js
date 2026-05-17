import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Dashboard palette so exports look like the rest of the site.
const PRIMARY = [61, 76, 65];      // #3D4C41
const ACCENT  = [110, 140, 113];   // #6E8C71
const BG      = [249, 246, 242];   // #F9F6F2
const MUTED   = [120, 120, 120];

// ─── Markdown parsing ────────────────────────────────────────────────────────

// Pull GFM tables out of an assistant message and return { tables, narrative }
// where tables is an array of { header: string[], rows: string[][] } and
// narrative is the leftover prose (paragraphs, bullets, headings) with the
// table blocks excised. Cheap line-based parser, no AST.
export const parseMarkdownTables = (text) => {
    if (!text) return { tables: [], narrative: '' };
    const lines = text.split('\n');
    const tables = [];
    const narrativeLines = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const next = lines[i + 1] || '';
        const looksHeader = /^\s*\|.+\|\s*$/.test(line);
        const looksSep    = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(next);

        if (looksHeader && looksSep) {
            const header = splitRow(line);
            const rows = [];
            i += 2;
            while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
                rows.push(splitRow(lines[i]));
                i++;
            }
            tables.push({ header, rows });
        } else {
            narrativeLines.push(line);
            i++;
        }
    }

    // Strip markdown emphasis / inline code from narrative so the PDF reads clean
    const narrative = narrativeLines
        .join('\n')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^### (.+)$/gm, '$1')
        .replace(/^## (.+)$/gm, '$1')
        .replace(/^# (.+)$/gm, '$1')
        .replace(/^- (.+)$/gm, '• $1')
        .trim();

    return { tables, narrative };
};

const splitRow = (line) => {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split('|').map(c => c.trim().replace(/\*\*/g, ''));
};

// ─── Filename helper ─────────────────────────────────────────────────────────

const safeFilename = (title) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = (title || 'respuesta-ia')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50);
    return `juntos-${slug}-${stamp}`;
};

// ─── PDF ─────────────────────────────────────────────────────────────────────

/**
 * Generate a one- or multi-page PDF in the dashboard style.
 *   - cover band with title + date
 *   - body paragraphs (narrative)
 *   - any markdown tables rendered with autoTable in the dashboard palette
 *   - small footer with attribution
 */
export const exportMessageToPDF = (markdown, opts = {}) => {
    const title = opts.title || 'Informe Juntos';
    const { tables, narrative } = parseMarkdownTables(markdown);

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 48;

    // Header band
    doc.setFillColor(...BG);
    doc.rect(0, 0, pageW, 90, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...PRIMARY);
    doc.text(title, margin, 48);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(`Generado el ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}`, margin, 68);
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(1);
    doc.line(margin, 82, pageW - margin, 82);

    let cursor = 120;

    // Narrative
    if (narrative) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(40, 40, 40);
        const wrapped = doc.splitTextToSize(narrative, pageW - 2 * margin);
        const lineH = 16;
        wrapped.forEach(line => {
            if (cursor > pageH - 60) { doc.addPage(); cursor = margin; }
            doc.text(line, margin, cursor);
            cursor += lineH;
        });
        cursor += 12;
    }

    // Tables
    tables.forEach((t, idx) => {
        if (cursor > pageH - 120) { doc.addPage(); cursor = margin; }
        autoTable(doc, {
            startY: cursor,
            head: [t.header],
            body: t.rows,
            margin: { left: margin, right: margin },
            styles: {
                fontSize: 10,
                cellPadding: 6,
                textColor: [40, 40, 40],
                lineColor: [220, 220, 220],
                lineWidth: 0.5,
            },
            headStyles: {
                fillColor: PRIMARY,
                textColor: 255,
                fontStyle: 'bold',
                fontSize: 10,
            },
            alternateRowStyles: { fillColor: [249, 247, 244] },
        });
        cursor = doc.lastAutoTable.finalY + 24;
        if (idx < tables.length - 1 && cursor > pageH - 100) {
            doc.addPage();
            cursor = margin;
        }
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text(`Juntos · Asistente IA · página ${p} de ${pageCount}`, margin, pageH - 24);
    }

    doc.save(`${safeFilename(title)}.pdf`);
};

// ─── XLSX ────────────────────────────────────────────────────────────────────

/**
 * Generate an XLSX:
 *   - if the message has tables: one sheet per table named Tabla1, Tabla2...
 *   - always: a "Respuesta" sheet with the full narrative + question
 * Falls back to a single "Respuesta" sheet if nothing else is parseable.
 */
export const exportMessageToXLSX = (markdown, opts = {}) => {
    const title = opts.title || 'Informe Juntos';
    const question = opts.question || '';
    const { tables, narrative } = parseMarkdownTables(markdown);

    const wb = XLSX.utils.book_new();

    tables.forEach((t, i) => {
        const aoa = [t.header, ...t.rows];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        // Autosize columns based on max content length per col
        const colWidths = t.header.map((_, ci) => {
            let max = String(t.header[ci]).length;
            t.rows.forEach(r => { max = Math.max(max, String(r[ci] || '').length); });
            return { wch: Math.min(50, max + 2) };
        });
        ws['!cols'] = colWidths;
        XLSX.utils.book_append_sheet(wb, ws, `Tabla${i + 1}`.slice(0, 31));
    });

    // Always include a Respuesta sheet
    const respuesta = [
        ['Pregunta', question || '—'],
        ['Fecha', new Date().toLocaleString('es-ES')],
        [],
        ['Respuesta completa:'],
        ...(narrative ? narrative.split('\n').map(l => [l]) : [['(sin texto narrativo)']]),
    ];
    const wsResp = XLSX.utils.aoa_to_sheet(respuesta);
    wsResp['!cols'] = [{ wch: 100 }];
    XLSX.utils.book_append_sheet(wb, wsResp, 'Respuesta');

    XLSX.writeFile(wb, `${safeFilename(title)}.xlsx`);
};
