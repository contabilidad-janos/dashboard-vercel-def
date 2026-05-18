#!/usr/bin/env node
/**
 * Builds docs/architecture.png — a stakeholder infographic that traces
 * the lemonade-to-chat pipeline end-to-end. Standalone PNG, no web tab.
 *
 * Hand-built SVG with inline lucide icons → @resvg/resvg-js → PNG.
 * Icons are drawn from the lucide package (vector paths) so they
 * rasterize cleanly at any size — emojis don't, resvg renders them mono.
 */
import fs from 'fs';
import { Resvg } from '@resvg/resvg-js';
import * as lucide from 'lucide';

// Dashboard palette
const C = {
    bg:        '#F9F6F2',
    primary:   '#3D4C41',
    accent:    '#6E8C71',
    beige:     '#B09B80',
    orange:    '#D9825F',
    muted:     '#A9A9A9',
    border:    '#E5E0D5',
    cardBeige: '#F2EBE0',
    cardGreen: '#E8EFE8',
    cardOrange:'#FBE9DC',
};

// Plain-English steps, no codebase jargon, no personal names.
const CAPTURE = [
    { icon: 'GlassWater', title: 'Customer buys a lemonade', tech: 'Outlet',       desc: 'At any Juntos location.' },
    { icon: 'ScanLine',   title: 'POS records the sale',     tech: 'POS',          desc: 'Item, price, time.' },
    { icon: 'Landmark',   title: 'Sale lands in accounting', tech: 'Accounting',   desc: 'Daily roll-up by outlet.' },
    { icon: 'Download',   title: 'Weekly export',            tech: 'Weekly',       desc: 'Spreadsheets pulled once a week.' },
    { icon: 'Cog',        title: 'Importer cleans the data', tech: 'Automation',   desc: 'Normalizes and deduplicates.' },
    { icon: 'Database',   title: 'Database stores it',       tech: 'Database',     desc: 'Ready to query.' },
    { icon: 'BarChart3',  title: 'Dashboard shows it',       tech: 'Dashboard',    desc: 'KPIs and year-over-year trends.' },
];

const CHAT = [
    { icon: 'MessageSquare', title: '"How many lemonades did we sell?"', tech: 'User',     desc: 'A simple question in plain language.' },
    { icon: 'Webhook',       title: 'Assistant receives the question',   tech: 'Backend',  desc: 'Routed to the AI workflow.' },
    { icon: 'Sparkles',      title: 'AI picks the right tool',           tech: 'AI',       desc: 'Understands intent, plans the query.' },
    { icon: 'Wrench',        title: 'Tool queries the database',         tech: 'Lookup',   desc: 'Fetches only the rows that matter.' },
    { icon: 'Database',      title: 'Database returns the data',         tech: 'Database', desc: 'Filtered and aggregated.' },
    { icon: 'FileText',      title: 'AI writes a clear answer',          tech: 'Answer',   desc: 'Numbers, table, short summary.' },
    { icon: 'Send',          title: 'User exports if needed',            tech: 'Export',   desc: 'One click to PDF or Excel.' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────
const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Render a lucide icon as SVG. lucide.IconName comes as an array of
 * [tag, attrs] tuples — we wrap them in a <g> with the right transform.
 */
const renderIcon = (name, x, y, size = 36, color = C.primary) => {
    const nodes = lucide[name];
    if (!nodes) return `<!-- icon ${name} not found -->`;
    const scale = size / 24;
    const inner = nodes.map(([tag, attrs]) => {
        const a = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
        return `<${tag} ${a}/>`;
    }).join('');
    return `
        <g transform="translate(${x - size/2}, ${y - size/2}) scale(${scale})"
           fill="none" stroke="${color}" stroke-width="1.7"
           stroke-linecap="round" stroke-linejoin="round">
            ${inner}
        </g>`;
};

const text = (x, y, str, opts = {}) => {
    const { size = 14, weight = 'normal', color = '#222', family = 'Inter, sans-serif', anchor = 'start' } = opts;
    return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${escape(str)}</text>`;
};

const wrap = (s, maxChars) => {
    const words = s.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
        if ((line + ' ' + w).trim().length > maxChars) {
            if (line) lines.push(line);
            line = w;
        } else {
            line = (line + ' ' + w).trim();
        }
    }
    if (line) lines.push(line);
    return lines;
};

// ─── Layout constants ───────────────────────────────────────────────────────
const W = 2400, H = 1500;
const MARGIN = 80;
const TIMELINE_TOP = 320;
const TIMELINE_BOT = 950;

const colCount = 7;
const cardW = 260;
const cardH = 240;
const colSpacing = (W - 2 * MARGIN - cardW * colCount) / (colCount - 1) + cardW;

// ─── Drawing ────────────────────────────────────────────────────────────────
const drawStep = (x, y, step, idx, palette) => {
    // Card background
    const cardSvg = `
        <rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="16" ry="16"
              fill="${palette.card}" stroke="${C.border}" stroke-width="1.5"/>
    `;
    // Numbered circle (top-left)
    const numSvg = `
        <circle cx="${x + 28}" cy="${y + 28}" r="20" fill="${C.primary}"/>
        ${text(x + 28, y + 35, String(idx + 1), { size: 16, weight: '700', color: '#fff', family: 'Lora, serif', anchor: 'middle' })}
    `;
    // Tech badge (top-right) — dynamic width based on text length, font 9pt
    const techStr = step.tech.toUpperCase();
    const badgeW = techStr.length * 6.5 + 18;
    const badgeX = x + cardW - 14 - badgeW;
    const badgeSvg = `
        <rect x="${badgeX}" y="${y + 18}" width="${badgeW}" height="22" rx="11" ry="11" fill="${palette.badge}"/>
        ${text(badgeX + badgeW / 2, y + 33, techStr, { size: 10, weight: '700', color: '#fff', anchor: 'middle' })}
    `;
    // Icon
    const iconSvg = renderIcon(step.icon, x + cardW / 2, y + 100, 48, C.primary);
    // Title (1-2 lines)
    const titleLines = wrap(step.title, 24);
    const titleSvg = titleLines.map((line, i) =>
        text(x + cardW / 2, y + 150 + i * 20, line, { size: 14.5, weight: '600', color: C.primary, family: 'Lora, serif', anchor: 'middle' })
    ).join('');
    // Description
    const descStart = y + 150 + titleLines.length * 20 + 10;
    const descSvg = wrap(step.desc, 33).map((line, i) =>
        text(x + cardW / 2, descStart + i * 14, line, { size: 11, color: '#555', anchor: 'middle' })
    ).join('');

    return cardSvg + numSvg + badgeSvg + iconSvg + titleSvg + descSvg;
};

const drawTimeline = (steps, y, palette, label) => {
    const arrowY = y + 120;
    let svg = '';

    // Label band
    svg += `
        <rect x="${MARGIN}" y="${y - 50}" width="170" height="28" rx="14" ry="14" fill="${palette.badge}"/>
        ${text(MARGIN + 85, y - 32, label, { size: 11, weight: '700', color: '#fff', anchor: 'middle' })}
    `;

    // Arrows between cards
    for (let i = 0; i < steps.length - 1; i++) {
        const x1 = MARGIN + cardW + i * colSpacing - 4;
        const x2 = MARGIN + (i + 1) * colSpacing + 4;
        svg += `
            <line x1="${x1}" y1="${arrowY}" x2="${x2 - 10}" y2="${arrowY}" stroke="${C.muted}" stroke-width="2"/>
            <polygon points="${x2 - 10},${arrowY - 5} ${x2 - 2},${arrowY} ${x2 - 10},${arrowY + 5}" fill="${C.muted}"/>
        `;
    }

    // Cards
    steps.forEach((step, i) => {
        const x = MARGIN + i * colSpacing;
        svg += drawStep(x, y, step, i, palette);
    });

    return svg;
};

const PALETTES = {
    capture: { card: C.cardBeige,  badge: C.beige },
    chat:    { card: C.cardOrange, badge: C.orange },
};

function buildSvg() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FBF8F4"/>
      <stop offset="100%" stop-color="${C.bg}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bgGrad)"/>

  <!-- Header -->
  ${text(MARGIN, 100, 'THE JOURNEY OF A LEMONADE', { size: 16, weight: '700', color: C.accent })}
  ${text(MARGIN, 168, 'From a sale at the counter to an answer on your screen', { size: 40, weight: '600', color: C.primary, family: 'Lora, serif' })}
  ${text(MARGIN, 215, 'How every sale is captured, stored, and turned into a conversation with the assistant.', { size: 16, color: '#555' })}

  <line x1="${MARGIN}" y1="252" x2="${W - MARGIN}" y2="252" stroke="${C.accent}" stroke-width="1.5" opacity="0.35"/>
  ${text(W - MARGIN, 168, 'Juntos · Sales Dashboard', { size: 16, weight: '600', color: C.primary, family: 'Lora, serif', anchor: 'end' })}

  <!-- CAPTURE timeline -->
  ${drawTimeline(CAPTURE, TIMELINE_TOP, PALETTES.capture, 'STEP 1 · CAPTURE')}

  <!-- Bridge -->
  <g>
    <line x1="${MARGIN}" y1="${TIMELINE_TOP + 290}" x2="${W - MARGIN}" y2="${TIMELINE_TOP + 290}" stroke="${C.muted}" stroke-dasharray="4,4" stroke-width="1" opacity="0.5"/>
    <rect x="${W/2 - 180}" y="${TIMELINE_TOP + 278}" width="360" height="26" rx="13" ry="13" fill="${C.cardGreen}" stroke="${C.accent}"/>
    ${text(W/2, TIMELINE_TOP + 296, 'Data is ready in the database', { size: 12, weight: '600', color: C.primary, anchor: 'middle' })}
  </g>

  <!-- CHAT timeline -->
  ${drawTimeline(CHAT, TIMELINE_BOT, PALETTES.chat, 'STEP 2 · ASK THE ASSISTANT')}

  <!-- Footer KPIs -->
  <g transform="translate(${MARGIN}, ${H - 140})">
    <rect x="0"    y="0" width="700" height="100" rx="14" ry="14" fill="#fff" stroke="${C.border}"/>
    ${text(24, 42, '~7 days', { size: 32, weight: '700', color: C.primary, family: 'Lora, serif' })}
    ${text(24, 70, 'Data freshness', { size: 14, weight: '600', color: '#444' })}
    ${text(24, 90, 'from the counter to the dashboard', { size: 12, color: C.muted })}

    <rect x="740"  y="0" width="700" height="100" rx="14" ry="14" fill="#fff" stroke="${C.border}"/>
    ${text(764, 42, '~4 sec', { size: 32, weight: '700', color: C.primary, family: 'Lora, serif' })}
    ${text(764, 70, 'Answer time', { size: 14, weight: '600', color: '#444' })}
    ${text(764, 90, 'from question to written answer', { size: 12, color: C.muted })}

    <rect x="1480" y="0" width="760" height="100" rx="14" ry="14" fill="#fff" stroke="${C.border}"/>
    ${text(1504, 42, '€0.002', { size: 32, weight: '700', color: C.primary, family: 'Lora, serif' })}
    ${text(1504, 70, 'Cost per question', { size: 14, weight: '600', color: '#444' })}
    ${text(1504, 90, 'less than a third of a cent', { size: 12, color: C.muted })}
  </g>

  ${text(W / 2, H - 22, 'Juntos · Sales Dashboard', { size: 11, color: C.muted, anchor: 'middle' })}
</svg>`;
}

const svg = buildSvg();
fs.writeFileSync('docs/architecture.svg', svg, 'utf8');
console.log('Wrote docs/architecture.svg');

const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    background: 'rgba(255,255,255,0)',
    font: { loadSystemFonts: true },
});
const png = resvg.render().asPng();
fs.writeFileSync('docs/architecture.png', png);
console.log(`Wrote docs/architecture.png (${(png.length / 1024).toFixed(0)} KB)`);
