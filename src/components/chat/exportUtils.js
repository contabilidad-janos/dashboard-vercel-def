import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Chart from 'chart.js/auto';

// Dashboard palette so exports look like the rest of the site.
const PRIMARY = [61, 76, 65];      // #3D4C41
const ACCENT  = [110, 140, 113];   // #6E8C71
const BG      = [249, 246, 242];   // #F9F6F2
const MUTED   = [120, 120, 120];
const PAL = ['#6E8C71', '#B09B80', '#D9825F', '#E8C89A', '#879FA8', '#566E7A', '#C4BFAA', '#A9A9A9'];

// ─── Markdown parsing ────────────────────────────────────────────────────────

// Pull GFM tables out of an assistant message (used by the XLSX export).
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
            while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
            tables.push({ header, rows });
        } else { narrativeLines.push(line); i++; }
    }
    return { tables, narrative: cleanNarrative(narrativeLines.join('\n')) };
};

const splitRow = (line) => {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split('|').map(c => c.trim().replace(/\*\*/g, ''));
};

const cleanNarrative = (s) => s
    .replace(/```[\s\S]*?```/g, '')               // drop any fenced code (chart/kpi specs)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+(.+)$/gm, '$1')
    .replace(/^[-*]\s+(.+)$/gm, '• $1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// Walk the message into ORDERED segments for the PDF: text / table / kpi / chart.
// Chart specs (and bubble/pie/doughnut) are normalised to bar charts.
export const parseSegments = (text) => {
    if (!text) return [];
    const lines = text.split('\n');
    const segs = [];
    let buf = [];
    const flush = () => { const t = cleanNarrative(buf.join('\n')); if (t) segs.push({ type: 'text', text: t }); buf = []; };

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const fence = line.match(/^\s*```(\w*)\s*$/);
        if (fence) {
            let j = i + 1; const body = [];
            while (j < lines.length && !/^\s*```\s*$/.test(lines[j])) { body.push(lines[j]); j++; }
            const raw = body.join('\n').trim();
            let spec = null; try { spec = JSON.parse(raw); } catch { /* not a spec */ }
            if (spec?.type === 'kpi' && Array.isArray(spec.kpis)) { flush(); segs.push({ type: 'kpi', spec }); }
            else if (spec && (spec.type === 'bubble' || ['bar', 'line', 'pie', 'doughnut'].includes(spec.type))) { flush(); segs.push({ type: 'chart', spec: toBar(spec) }); }
            // any other fenced block: dropped (no raw JSON in the PDF)
            i = j + 1; continue;
        }
        const next = lines[i + 1] || '';
        if (/^\s*\|.+\|\s*$/.test(line) && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(next)) {
            flush();
            const header = splitRow(line); const rows = []; i += 2;
            while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
            segs.push({ type: 'table', header, rows });
            continue;
        }
        buf.push(line); i++;
    }
    flush();
    return segs;
};

// Normalise any chart spec to a bar chart (user prefers bars over pies/bubbles).
const toBar = (spec) => {
    if (spec.type === 'bubble') {
        const bs = (spec.bubbles || []).filter(b => b && b.label != null);
        return { type: 'bar', title: spec.title, unit: spec.unit, labels: bs.map(b => b.label), values: bs.map(b => Number(b.value) || 0), changes: bs.map(b => Number(b.change)) };
    }
    if (spec.type === 'pie' || spec.type === 'doughnut') return { ...spec, type: 'bar' };
    return spec;
};

const buildChartConfig = (spec) => {
    const datasets = (spec.datasets && spec.datasets.length) ? spec.datasets : [{ name: spec.title || '', values: spec.values || [] }];
    const colorsByChange = Array.isArray(spec.changes)
        ? spec.changes.map(c => (Number.isFinite(c) ? (c >= 0 ? '#4C8C63' : '#C94A46') : '#A9A9A9'))
        : null;
    return {
        type: spec.type === 'line' ? 'line' : 'bar',
        data: {
            labels: spec.labels || [],
            datasets: datasets.map((ds, i) => ({
                label: ds.name || ds.label || '',
                data: ds.values || [],
                backgroundColor: colorsByChange || ds.color || PAL[i % PAL.length],
                borderColor: ds.color || PAL[i % PAL.length],
                borderWidth: spec.type === 'line' ? 2 : 0,
                tension: spec.type === 'line' ? 0.3 : undefined,
                fill: false,
            })),
        },
        options: {
            animation: false, responsive: false, devicePixelRatio: 2,
            plugins: { legend: { display: datasets.length > 1, position: 'bottom', labels: { font: { size: 12 } } } },
            scales: { x: { grid: { display: false }, ticks: { font: { size: 11 } } }, y: { beginAtZero: true, ticks: { font: { size: 11 } } } },
        },
    };
};

// Render a chart spec to a PNG data URL via an off-screen ChartJS canvas.
const chartToImage = (spec) => {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 1000; canvas.height = 460;
        const chart = new Chart(canvas, buildChartConfig(spec));
        const url = canvas.toDataURL('image/png', 1.0);
        chart.destroy();
        return url;
    } catch { return null; }
};

const fmtKpiVal = (k) => {
    if (typeof k.value === 'string') return k.value;
    const n = Number(k.value);
    if (!Number.isFinite(n)) return String(k.value);
    const s = n.toLocaleString('en-US');
    if (k.unit === '€') return '€' + s;
    if (k.unit === '%') return n.toFixed(1) + '%';
    return s + (k.unit ? ' ' + k.unit : '');
};

// ─── Filename helper ─────────────────────────────────────────────────────────

const safeFilename = (title) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = (title || 'respuesta-ia').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
    return `juntos-${slug}-${stamp}`;
};

// ─── PDF ─────────────────────────────────────────────────────────────────────

export const exportMessageToPDF = (markdown, opts = {}) => {
    const title = opts.title || 'Informe Juntos';
    const segments = parseSegments(markdown);

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 48;
    const contentW = pageW - 2 * margin;

    // Header band
    doc.setFillColor(...BG);
    doc.rect(0, 0, pageW, 90, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...PRIMARY);
    doc.text(title, margin, 48);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTED);
    doc.text(`Generado el ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}`, margin, 68);
    doc.setDrawColor(...ACCENT); doc.setLineWidth(1); doc.line(margin, 82, pageW - margin, 82);

    let cursor = 116;
    const ensure = (h) => { if (cursor + h > pageH - 50) { doc.addPage(); cursor = margin; } };

    for (const seg of segments) {
        if (seg.type === 'text') {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(40, 40, 40);
            const wrapped = doc.splitTextToSize(seg.text, contentW);
            for (const line of wrapped) { ensure(16); doc.text(line, margin, cursor); cursor += 16; }
            cursor += 8;
        } else if (seg.type === 'kpi') {
            const kpis = (seg.spec.kpis || []).slice(0, 4);
            if (!kpis.length) continue;
            const tileH = 60, gap = 8;
            const tileW = (contentW - gap * (kpis.length - 1)) / kpis.length;
            ensure(tileH + 12);
            kpis.forEach((k, i) => {
                const tx = margin + i * (tileW + gap);
                doc.setDrawColor(225); doc.setFillColor(255); doc.roundedRect(tx, cursor, tileW, tileH, 4, 4, 'FD');
                doc.setFontSize(7); doc.setTextColor(...MUTED);
                doc.text(String(k.label || '').toUpperCase().slice(0, 24), tx + 8, cursor + 15);
                doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...PRIMARY);
                doc.text(String(fmtKpiVal(k)).slice(0, 16), tx + 8, cursor + 36);
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
                if (Number.isFinite(Number(k.change))) {
                    const c = Number(k.change); doc.setTextColor(...(c >= 0 ? [40, 140, 90] : [200, 70, 70]));
                    doc.text(`${c >= 0 ? '+' : ''}${c}%`, tx + 8, cursor + 51);
                } else if (k.hint) { doc.setTextColor(...MUTED); doc.text(String(k.hint).slice(0, 18), tx + 8, cursor + 51); }
            });
            cursor += tileH + 16;
        } else if (seg.type === 'chart') {
            const img = chartToImage(seg.spec);
            if (!img) continue;
            const imgH = contentW * (460 / 1000);
            ensure(imgH + (seg.spec.title ? 22 : 8));
            if (seg.spec.title) {
                doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...PRIMARY);
                doc.text(String(seg.spec.title), margin, cursor); cursor += 16;
            }
            doc.addImage(img, 'PNG', margin, cursor, contentW, imgH);
            cursor += imgH + 16;
        } else if (seg.type === 'table') {
            ensure(60);
            autoTable(doc, {
                startY: cursor, head: [seg.header], body: seg.rows,
                margin: { left: margin, right: margin },
                styles: { fontSize: 10, cellPadding: 6, textColor: [40, 40, 40], lineColor: [220, 220, 220], lineWidth: 0.5 },
                headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold', fontSize: 10 },
                alternateRowStyles: { fillColor: [249, 247, 244] },
            });
            cursor = doc.lastAutoTable.finalY + 20;
        }
    }

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setFontSize(8); doc.setTextColor(...MUTED);
        doc.text(`Juntos · Asistente IA · página ${p} de ${pageCount}`, margin, pageH - 24);
    }

    doc.save(`${safeFilename(title)}.pdf`);
};

// ─── XLSX ────────────────────────────────────────────────────────────────────

export const exportMessageToXLSX = (markdown, opts = {}) => {
    const title = opts.title || 'Informe Juntos';
    const question = opts.question || '';
    const { tables, narrative } = parseMarkdownTables(markdown);

    const wb = XLSX.utils.book_new();

    tables.forEach((t, i) => {
        const aoa = [t.header, ...t.rows];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const colWidths = t.header.map((_, ci) => {
            let max = String(t.header[ci]).length;
            t.rows.forEach(r => { max = Math.max(max, String(r[ci] || '').length); });
            return { wch: Math.min(50, max + 2) };
        });
        ws['!cols'] = colWidths;
        XLSX.utils.book_append_sheet(wb, ws, `Tabla${i + 1}`.slice(0, 31));
    });

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
