import React, { useEffect, useState, useMemo } from 'react';
import { DataService, MONTHS, BUSINESS_UNITS, WEEKLY_LABELS_2025, WEEKLY_LABELS_2026, WEEK_MONTH_MAP } from '../services/dataService';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import DetailsFilters from './details/DetailsFilters';
import DetailsChart from './details/DetailsChart';
import DetailsTable from './details/DetailsTable';
// Chart.js is fully registered in App.jsx — do NOT re-register here.

import { VAT_RATES } from '../data/SEED_DATA';

const BU_COLORS = {
    'Juntos house': '#6E8C71',
    'Juntos boutique': '#B09B80',
    'Picadeli': '#D9825F',
    'Juntos farm shop': '#E8C89A',
    'Tasting place': '#879FA8',
    'Distribution b2b': '#566E7A',
    'Juntos Products': '#C4BFAA',
    'Activities': '#A9A9A9',
    'All Groups': '#405846',
};
const COLORS_ARRAY = Object.values(BU_COLORS);

const getLastWeekIndex = () => {
    const today = new Date();
    const s = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
    const e = endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
    const lbl = `${format(s, 'dd/MM')}-${format(e, 'dd/MM')}`;
    const idx = WEEKLY_LABELS_2025.indexOf(lbl);
    return idx !== -1 ? idx : WEEKLY_LABELS_2025.length - 1;
};

const sumArr = (arr) => (arr || []).reduce((s, v) => s + (Number(v) || 0), 0);
const safeNum = (v) => Number(v) || 0;
const _pad = (n) => String(n).padStart(2, '0');
const localDateStr = (d) => `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`;

// Lighter (semi-transparent) variant of a hex color, used to distinguish
// previous-year datasets from current-year ones at a glance.
const lightenColor = (hex, alpha = 0.4) => {
    if (typeof hex !== 'string' || hex[0] !== '#' || hex.length !== 7) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Build weekly aggregates from raw records using calendar ranges parsed from labels
// (e.g., "12/04-18/04"), so the bucket window matches the displayed label for both
// current-year and previous-year comparisons.
const buildWeeklyFromRaw = (rawRecords, calendarYear, weekLabels) => {
    const sales = {}, trans = {};
    BUSINESS_UNITS.forEach(u => {
        sales[u] = new Array(weekLabels.length).fill(0);
        trans[u] = new Array(weekLabels.length).fill(0);
    });
    const ranges = weekLabels.map(lbl => {
        if (!lbl || !lbl.includes('-')) return null;
        const [s, e] = lbl.split('-');
        const [sd, sm] = s.split('/').map(Number);
        const [ed, em] = e.split('/').map(Number);
        const endY = em < sm ? calendarYear + 1 : calendarYear;
        return [
            `${calendarYear}-${_pad(sm)}-${_pad(sd)}`,
            `${endY}-${_pad(em)}-${_pad(ed)}`
        ];
    });
    (rawRecords || []).forEach(r => {
        if (!r.date) return;
        if (!sales[r.business_unit]) return;
        for (let i = 0; i < ranges.length; i++) {
            const rg = ranges[i];
            if (!rg) continue;
            if (r.date >= rg[0] && r.date <= rg[1]) {
                sales[r.business_unit][i] += Number(r.revenue) || 0;
                const vol = r.VOLUME;
                const v = (vol == null || vol === '') ? 0
                    : (typeof vol === 'number' ? vol : parseFloat(String(vol).replace(/,/g, '')) || 0);
                trans[r.business_unit][i] += v;
                break;
            }
        }
    });
    return { sales, trans };
};

const DashboardDetails = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [rawData, setRawData] = useState({});
    const [selectedYear, setSelectedYear] = useState('2026');
    const [selectedUnits, setSelectedUnits] = useState(['All Groups']);
    const [metric, setMetric] = useState('sales');
    const [viewType, setViewType] = useState('monthly');
    const [chartType, setChartType] = useState('bar');
    const _today = new Date();
    const _lastWeek = new Date(_today);
    _lastWeek.setDate(_today.getDate() - 6);

    const [dailyStart, setDailyStart] = useState(localDateStr(_lastWeek));
    const [dailyEnd, setDailyEnd] = useState(localDateStr(_today));
    const [startPeriod, setStartPeriod] = useState(0);
    const [endPeriod, setEndPeriod] = useState(11);
    const [compare24, setCompare24] = useState(true);
    const [compareBudget, setCompareBudget] = useState(false);
    const [showLabels, setShowLabels] = useState(true);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [includeVat, setIncludeVat] = useState(false);

    const getDisplayValue = (val, unitName) => {
        const n = safeNum(val);
        if (!includeVat || !n) return n;
        return n * (1 + (VAT_RATES[unitName] ?? 0));
    };

    useEffect(() => {
        if (viewType === 'monthly') { setStartPeriod(0); setEndPeriod(11); }
        else if (viewType === 'weekly') { const i = getLastWeekIndex(); setStartPeriod(i); setEndPeriod(i); }
        else if (viewType === 'yearly') { setStartPeriod(0); setEndPeriod(1); }
        else if (viewType === 'daily') {
            const endd = new Date();
            const startd = new Date();
            startd.setDate(endd.getDate() - 6);
            setDailyStart(localDateStr(startd));
            setDailyEnd(localDateStr(endd));
        }
    }, [viewType]);

    useEffect(() => {
        const load = async () => {
            try {
                const [
                    sales25, sales25w, trans25, trans25w, spend25,
                    sales24, sales24w, trans24, trans24w, spend24,
                    sales26, sales26w, trans26, trans26w, spend26,
                    budget25u, budget26u, raw2025, raw2026,
                ] = await Promise.all([
                    DataService.get2025SalesData(),
                    DataService.get2025SalesDataWeekly(),
                    DataService.get2025TransData(),
                    DataService.get2025TransDataWeekly(),
                    DataService.get2025SpendData(),
                    DataService.get2024SalesData(),
                    DataService.get2024SalesDataWeekly(),
                    DataService.get2024TransData(),
                    DataService.get2024TransDataWeekly(),
                    DataService.get2024SpendData(),
                    DataService.get2026SalesData(),
                    DataService.get2026SalesDataWeekly(),
                    DataService.get2026TransData(),
                    DataService.get2026TransDataWeekly(),
                    DataService.get2026SpendData(),
                    DataService.get2025BudgetDataByUnit(),
                    DataService.get2026BudgetData(),
                    DataService.get2025RawData(),
                    DataService.get2026RawData(),
                ]);
                setRawData({
                    sales25, sales25w, trans25, trans25w, spend25,
                    sales24, sales24w, trans24, trans24w, spend24,
                    sales26, sales26w, trans26, trans26w, spend26,
                    budget25u, budget26u, raw2025, raw2026,
                });
            } catch (err) {
                console.error('DashboardDetails load error:', err);
                setError(err?.message || 'Unknown error');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const toggleUnit = (u) =>
        setSelectedUnits(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u]);

    const handlePredefinedPeriod = ({ target: { value: val } }) => {
        if (viewType === 'monthly') {
            const MAP = { q1: [0, 2], q2: [3, 5], q3: [6, 8], q4: [9, 11], summer: [3, 9], ytd: [0, new Date().getMonth()] };
            if (MAP[val]) { setStartPeriod(MAP[val][0]); setEndPeriod(MAP[val][1]); }
        } else if (viewType === 'weekly') {
            const lbls = selectedYear === '2026' ? WEEKLY_LABELS_2026 : WEEKLY_LABELS_2025;
            const MAP = { q1: [0, 12], q2: [13, 25], q3: [26, 38], q4: [39, lbls.length - 1] };
            if (MAP[val]) { setStartPeriod(MAP[val][0]); setEndPeriod(MAP[val][1]); }
        }
    };

    const chartData = useMemo(() => {
        if (!rawData.sales25) return null;

        const is2026 = selectedYear === '2026';
        const cS = is2026 ? rawData.sales26 : rawData.sales25;
        let cSw = is2026 ? rawData.sales26w : rawData.sales25w;
        const cT = is2026 ? rawData.trans26 : rawData.trans25;
        let cTw = is2026 ? rawData.trans26w : rawData.trans25w;
        const cSp = is2026 ? rawData.spend26 : rawData.spend25;
        const pS = is2026 ? rawData.sales25 : rawData.sales24;
        let pSw = is2026 ? rawData.sales25w : rawData.sales24w;
        const pT = is2026 ? rawData.trans25 : rawData.trans24;
        let pTw = is2026 ? rawData.trans25w : rawData.trans24w;
        const pSp = is2026 ? rawData.spend25 : rawData.spend24;
        const bud = is2026 ? rawData.budget26u : rawData.budget25u;
        const wLbls = is2026 ? WEEKLY_LABELS_2026 : WEEKLY_LABELS_2025;
        const yCurr = is2026 ? '2026' : '2025';
        const yPrev = is2026 ? '2025' : '2024';
        const shCurr = is2026 ? "'26" : "'25";
        const shPrev = is2026 ? "'25" : "'24";

        // Re-aggregate weekly data from raw records using the calendar ranges
        // in wLbls so current and previous year use matching date windows
        // (labels like "12/04-18/04" bucketed by exact month/day, not ISO week).
        if (viewType === 'weekly') {
            const curYear = is2026 ? 2026 : 2025;
            const prvYear = is2026 ? 2025 : 2024;
            const curRaw = is2026 ? rawData.raw2026 : rawData.raw2025;
            const prvRaw = is2026 ? rawData.raw2025 : rawData.raw2024;
            if (curRaw) {
                const a = buildWeeklyFromRaw(curRaw, curYear, wLbls);
                cSw = a.sales; cTw = a.trans;
            }
            if (prvRaw) {
                const a = buildWeeklyFromRaw(prvRaw, prvYear, wLbls);
                pSw = a.sales; pTw = a.trans;
            }
        }

        // ── YEARLY ────────────────────────────────────────────────────────
        if (viewType === 'yearly') {
            const ySpend = (sM, tM, u) => { const ts = sumArr(sM[u]), tt = sumArr(tM[u]); return tt > 0 ? Math.round(ts / tt) : 0; };
            const ds = [];
            selectedUnits.filter(u => u !== 'All Groups').forEach((unit, i) => {
                const col = COLORS_ARRAY[i % COLORS_ARRAY.length];
                const dP = metric === 'sales' ? sumArr((pS[unit] || []).map(v => getDisplayValue(v, unit))) : metric === 'transactions' ? sumArr(pT[unit]) : ySpend(pS, pT, unit);
                const dC = metric === 'sales' ? sumArr((cS[unit] || []).map(v => getDisplayValue(v, unit))) : metric === 'transactions' ? sumArr(cT[unit]) : ySpend(cS, cT, unit);
                ds.push({ label: unit, data: [dP, dC], backgroundColor: ['#A9A9A9', col], borderColor: ['#A9A9A9', col], borderWidth: 2 });
            });
            if (selectedUnits.includes('All Groups')) {
                let tP = 0, tC = 0;
                if (metric === 'spend') {
                    let sP = 0, rP = 0, sC = 0, rC = 0;
                    BUSINESS_UNITS.forEach(u => { sP += sumArr(pS[u]); rP += sumArr(pT[u]); sC += sumArr(cS[u]); rC += sumArr(cT[u]); });
                    tP = rP > 0 ? Math.round(sP / rP) : 0; tC = rC > 0 ? Math.round(sC / rC) : 0;
                } else {
                    const k = metric === 'sales' ? 'sales' : 'trans';
                    BUSINESS_UNITS.forEach(u => { tP += sumArr(rawData[`${k}${is2026 ? '25' : '24'}`]?.[u]); tC += sumArr(rawData[`${k}${is2026 ? '26' : '25'}`]?.[u]); });
                }
                ds.push({ label: 'All Groups', data: [tP, tC], backgroundColor: ['#A9A9A9', '#405846'], borderColor: ['#A9A9A9', '#405846'], borderWidth: 3 });
            }

            const unitTotals = {};
            BUSINESS_UNITS.forEach(u => {
                unitTotals[u] = metric === 'sales' ? sumArr((cS[u] || []).map(v => getDisplayValue(v, u))) : metric === 'transactions' ? sumArr(cT[u]) : ySpend(cS, cT, u);
            });
            return { labels: [yPrev, yCurr], datasets: ds, unitTotals };
        }

        // ── DAILY ─────────────────────────────────────────────────────────
        if (viewType === 'daily') {
            const dates = [];
            const prevDates = [];
            const start = new Date(dailyStart + 'T00:00:00');
            const end = new Date(dailyEnd + 'T00:00:00');
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                dates.push(localDateStr(d));
                const pd = new Date(d);
                pd.setDate(pd.getDate() - 364); // EXACTLY 52 weeks ago for day-of-week alignment
                prevDates.push(localDateStr(pd));
            }
            const rawCurr = [...(rawData.raw2025 || []), ...(rawData.raw2026 || [])];
            const rawPrev = [...(rawData.raw2024 || []), ...(rawData.raw2025 || [])];

            const getVal = (rArr, dateStr, unit) => {
                const recs = rArr.filter(r => r.date === dateStr);
                if (unit === 'All Groups') return BUSINESS_UNITS.reduce((t, u) => t + getDisplayValue(recs.filter(r => r.business_unit === u).reduce((s, r) => s + safeNum(r.revenue), 0), u), 0);
                return getDisplayValue(recs.filter(r => r.business_unit === unit).reduce((s, r) => s + safeNum(r.revenue), 0), unit);
            };

            const ds = [];
            selectedUnits.filter(u => u !== 'All Groups').forEach(unit => {
                const col = BU_COLORS[unit] || '#999';
                // Current
                ds.push({ label: `${unit} ${shCurr}`, data: dates.map(d => getVal(rawCurr, d, unit)), borderColor: col, backgroundColor: col, tension: 0.3, pointRadius: 4, borderWidth: 2 });
                // Previous (vs 24/25)
                if (compare24) {
                    ds.push({ label: `${unit} ${shPrev}`, data: prevDates.map(d => getVal(rawPrev, d, unit)), borderColor: lightenColor(col, 0.55), backgroundColor: lightenColor(col, 0.4), borderDash: [5, 5], tension: 0.3, pointRadius: 0, borderWidth: 2 });
                }
                // Budget
                if (compareBudget && metric === 'sales') {
                    const daysInMonth = (d) => new Date(parseInt(d.split('-')[0]), parseInt(d.split('-')[1]), 0).getDate();
                    const monthIdx = (d) => parseInt(d.split('-')[1]) - 1;
                    const budData = dates.map(d => {
                        const m = monthIdx(d);
                        const days = daysInMonth(d);
                        const bVal = (bud?.[unit]?.[m] || 0);
                        return getDisplayValue(bVal / days, unit);
                    });
                    ds.push({ label: `${unit} Budget`, data: budData, borderColor: col, borderDash: [2, 2], tension: 0, pointRadius: 0, borderWidth: 1 });
                }
            });

            if (selectedUnits.includes('All Groups')) {
                // Current
                ds.unshift({ label: `All Groups ${shCurr}`, data: dates.map(d => getVal(rawCurr, d, 'All Groups')), borderColor: '#405846', backgroundColor: '#405846', tension: 0.3, pointRadius: 4, borderWidth: 3 });
                // Previous
                if (compare24) {
                    ds.push({ label: `All Groups ${shPrev}`, data: prevDates.map(d => getVal(rawPrev, d, 'All Groups')), borderColor: '#A9A9A9', backgroundColor: '#A9A9A9', borderDash: [5, 5], tension: 0.3, pointRadius: 0, borderWidth: 2 });
                }
                // Budget
                if (compareBudget && metric === 'sales') {
                    const daysInMonth = (d) => new Date(parseInt(d.split('-')[0]), parseInt(d.split('-')[1]), 0).getDate();
                    const monthIdx = (d) => parseInt(d.split('-')[1]) - 1;
                    const budData = dates.map(d => {
                        const m = monthIdx(d);
                        const days = daysInMonth(d);
                        return BUSINESS_UNITS.reduce((acc, u) => acc + getDisplayValue((bud?.[u]?.[m] || 0) / days, u), 0);
                    });
                    ds.push({ label: `All Groups Budget`, data: budData, borderColor: '#6B7280', backgroundColor: 'rgba(255,255,255,0.8)', borderDash: [2, 2], tension: 0, pointRadius: 0, borderWidth: 2 });
                }
            }

            const unitTotals = {};
            BUSINESS_UNITS.forEach(unit => {
                unitTotals[unit] = sumArr(dates.map(d => getVal(rawCurr, d, unit)));
            });

            return { labels: dates, datasets: ds, unitTotals };
        }

        // ── MONTHLY / WEEKLY ──────────────────────────────────────────────
        let labels = viewType === 'monthly'
            ? MONTHS.slice(startPeriod, endPeriod + 1)
            : wLbls.slice(startPeriod, endPeriod + 1);

        if (viewType === 'weekly') {
            const getWeekDates = (idx, y) => {
                // Approximate: ISO week index. Or simply parse the string 'dd/MM-dd/MM' if present.
                const lbl = wLbls[idx];
                if (lbl && lbl.includes('-')) {
                    const [startStr, endStr] = lbl.split('-');
                    const formatDt = (s) => (s.split('/')[0] + ' ' + MONTHS[parseInt(s.split('/')[1]) - 1]?.substring(0, 3));
                    return `W${idx + 1} (${formatDt(startStr)} - ${formatDt(endStr)})`;
                }
                return `Week ${idx + 1}`;
            };
            labels = labels.map((_, i) => getWeekDates(startPeriod + i, yCurr));
        }

        const slc = (sM, tM, spM, sWm, tWm, unit) => {
            const sl = arr => (arr || []).slice(startPeriod, endPeriod + 1);
            if (viewType === 'monthly') {
                if (metric === 'sales') return sl((sM[unit] || []).map(v => getDisplayValue(v, unit)));
                if (metric === 'transactions') return sl(tM[unit]);
                return sl(spM[unit]);
            }
            if (metric === 'sales') return sl((sWm[unit] || []).map(v => getDisplayValue(v, unit)));
            if (metric === 'transactions') return sl(tWm[unit]);
            const sv = sWm[unit] || [], tv = tWm[unit] || [];
            return sl(sv.map((v, i) => tv[i] > 0 ? Math.round(getDisplayValue(v, unit) / tv[i]) : 0));
        };

        const datasets = [];
        selectedUnits.filter(u => u !== 'All Groups').forEach((unit, i) => {
            const col = COLORS_ARRAY[i % COLORS_ARRAY.length];
            datasets.push({ label: `${unit} ${shCurr}`, data: slc(cS, cT, cSp, cSw, cTw, unit), borderColor: col, backgroundColor: col, tension: 0.3, fill: false });
            if (compare24) datasets.push({ label: `${unit} ${shPrev}`, data: slc(pS, pT, pSp, pSw, pTw, unit), borderColor: lightenColor(col, 0.55), backgroundColor: lightenColor(col, 0.4), borderDash: [5, 5], borderWidth: 2, tension: 0.3, fill: false, pointRadius: 0 });
            if (compareBudget && metric === 'sales') {
                const bd = (bud?.[unit] || []).map(v => getDisplayValue(v, unit));
                const budSlice = viewType === 'monthly' ? bd.slice(startPeriod, endPeriod + 1) : Array.from({ length: endPeriod - startPeriod + 1 }, (_, wi) => Math.round((bd[WEEK_MONTH_MAP[startPeriod + wi] ?? 0] || 0) / 4));
                datasets.push({ label: `${unit} Budget`, data: budSlice, borderColor: col, borderDash: [2, 2], borderWidth: 2, tension: 0, fill: false });
            }
        });

        if (selectedUnits.includes('All Groups')) {
            const dLen = endPeriod - startPeriod + 1;
            const aggC = new Array(dLen).fill(0), aggP = new Array(dLen).fill(0), aggB = new Array(dLen).fill(0);
            if (metric !== 'spend') {
                BUSINESS_UNITS.forEach(unit => {
                    slc(cS, cT, cSp, cSw, cTw, unit).forEach((v, i) => { aggC[i] += v; });
                    if (compare24) slc(pS, pT, pSp, pSw, pTw, unit).forEach((v, i) => { aggP[i] += v; });
                    if (compareBudget && metric === 'sales') {
                        const bd = (bud?.[unit] || []).map(v => getDisplayValue(v, unit));
                        (viewType === 'monthly' ? bd.slice(startPeriod, endPeriod + 1) : Array.from({ length: dLen }, (_, wi) => Math.round((bd[WEEK_MONTH_MAP[startPeriod + wi] ?? 0] || 0) / 4))).forEach((v, i) => { aggB[i] += v; });
                    }
                });
            } else {
                for (let i = 0; i < dLen; i++) {
                    let ps = 0, pt = 0, ps2 = 0, pt2 = 0;
                    BUSINESS_UNITS.forEach(u => {
                        const idx = startPeriod + i;
                        ps += getDisplayValue((viewType === 'monthly' ? cS : cSw)?.[u]?.[idx] || 0, u); pt += (viewType === 'monthly' ? cT : cTw)?.[u]?.[idx] || 0;
                        ps2 += getDisplayValue((viewType === 'monthly' ? pS : pSw)?.[u]?.[idx] || 0, u); pt2 += (viewType === 'monthly' ? pT : pTw)?.[u]?.[idx] || 0;
                    });
                    aggC[i] = pt > 0 ? Math.round(ps / pt) : 0; aggP[i] = pt2 > 0 ? Math.round(ps2 / pt2) : 0;
                }
            }
            datasets.unshift({ label: `All Groups ${shCurr}`, data: aggC, borderColor: '#405846', backgroundColor: '#405846', tension: 0.3, fill: false, borderWidth: 3 });
            if (compare24) datasets.push({ label: `All Groups ${shPrev}`, data: aggP, borderColor: '#A9A9A9', backgroundColor: '#A9A9A9', borderDash: [5, 5], borderWidth: 2, tension: 0.3, fill: false });
            if (compareBudget && metric === 'sales') datasets.push({ label: 'All Groups Budget', data: aggB, borderColor: '#6B7280', backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: 2, tension: 0, fill: true });
        }

        const unitTotals = {};
        BUSINESS_UNITS.forEach(unit => {
            unitTotals[unit] = sumArr(slc(cS, cT, cSp, cSw, cTw, unit));
        });

        return { labels, datasets, unitTotals };
    }, [rawData, selectedUnits, metric, viewType, selectedYear, startPeriod, endPeriod, compare24, compareBudget, dailyStart, dailyEnd, includeVat]);

    if (error) return (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
            <p className="text-red-600 font-medium">Failed to load sales data.</p>
            <p className="text-gray-500 text-sm font-mono">{error}</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">Reload</button>
        </div>
    );

    if (loading) return (
        <div className="flex items-center justify-center py-24">
            <div className="text-center">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Loading sales data…</p>
            </div>
        </div>
    );

    return (
        <div id="dashboard-details-page">
            <div className="flex justify-between items-center mb-5">
                <h2 className="font-serif text-3xl font-semibold text-primary">Detailed Sales Analysis</h2>
            </div>

            <DetailsFilters
                selectedYear={selectedYear} setSelectedYear={setSelectedYear}
                selectedUnits={selectedUnits} toggleUnit={toggleUnit}
                metric={metric} setMetric={setMetric}
                viewType={viewType} setViewType={setViewType}
                chartType={chartType} setChartType={setChartType}
                startPeriod={startPeriod} setStartPeriod={setStartPeriod}
                endPeriod={endPeriod} setEndPeriod={setEndPeriod}
                dailyStart={dailyStart} dailyEnd={dailyEnd}
                onDailyRangeChange={(s, e) => { setDailyStart(s); if (e) setDailyEnd(e); }}
                compare24={compare24} setCompare24={setCompare24}
                compareBudget={compareBudget} setCompareBudget={setCompareBudget}
                includeVat={includeVat} setIncludeVat={setIncludeVat}
                handlePredefinedPeriod={handlePredefinedPeriod}
            />

            {/* Chart card — Labels + Fullscreen buttons are INSIDE this card (in DetailsChart header) */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
                <DetailsChart
                    chartData={chartData}
                    chartType={chartType}
                    metric={metric}
                    showLabels={showLabels}
                    setShowLabels={setShowLabels}
                    isFullScreen={isFullScreen}
                    setIsFullScreen={setIsFullScreen}
                    selectedYear={selectedYear}
                />
            </div>

            <DetailsTable chartData={chartData} metric={metric} />
        </div>
    );
};

export default DashboardDetails;
