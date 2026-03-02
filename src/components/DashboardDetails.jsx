import React, { useEffect, useState, useMemo } from 'react';
import { DataService, MONTHS, BUSINESS_UNITS, WEEKLY_LABELS_2025, WEEKLY_LABELS_2026, WEEK_MONTH_MAP } from '../services/dataService';
import { Chart } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import clsx from 'clsx';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import DetailsFilters from './details/DetailsFilters';
import DetailsChart from './details/DetailsChart';
import DetailsTable from './details/DetailsTable';

Chart.register(ChartDataLabels);

const VAT_RATES = {
    'Juntos house':      0.10,
    'Juntos boutique':   0.10,
    'Picadeli':          0.10,
    'Juntos farm shop':  0.10,
    'Tasting place':     0.10,
    'Distribution b2b':  0.10,
    'Juntos Products':   0.10,
    'Activities':        0.21,
};

const BU_COLORS = {
    'Juntos house':      '#6E8C71',
    'Juntos boutique':   '#B09B80',
    'Picadeli':          '#D9825F',
    'Juntos farm shop':  '#E8C89A',
    'Tasting place':     '#879FA8',
    'Distribution b2b':  '#566E7A',
    'Juntos Products':   '#C4BFAA',
    'Activities':        '#A9A9A9',
    'All Groups':        '#405846',
};
const COLORS_ARRAY = Object.values(BU_COLORS);

const getLastWeekIndex = () => {
    const today = new Date();
    const lastWeekStart = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
    const lastWeekEnd   = endOfWeek(subWeeks(today, 1),   { weekStartsOn: 1 });
    const label = `${format(lastWeekStart, 'dd/MM')}-${format(lastWeekEnd, 'dd/MM')}`;
    const idx = WEEKLY_LABELS_2025.indexOf(label);
    return idx !== -1 ? idx : WEEKLY_LABELS_2025.length - 1;
};

const sumArr  = (arr) => (arr || []).reduce((s, v) => s + (v || 0), 0);
const safeNum = (v) => Number(v) || 0;

const DashboardDetails = () => {
    const [loading, setLoading]             = useState(true);
    const [rawData, setRawData]             = useState({});
    const [selectedYear, setSelectedYear]   = useState('2025');
    const [selectedUnits, setSelectedUnits] = useState(['All Groups']);
    const [metric, setMetric]               = useState('sales');
    const [viewType, setViewType]           = useState('monthly');
    const [chartType, setChartType]         = useState('bar');
    const [dailyStart, setDailyStart]       = useState('2025-12-29');
    const [dailyEnd, setDailyEnd]           = useState('2026-01-04');
    const [startPeriod, setStartPeriod]     = useState(0);
    const [endPeriod, setEndPeriod]         = useState(11);
    const [compare24, setCompare24]         = useState(true);
    const [compareBudget, setCompareBudget] = useState(false);
    const [showLabels, setShowLabels]       = useState(true);
    const [isFullScreen, setIsFullScreen]   = useState(false);
    const [excludeVat, setExcludeVat]       = useState(false);

    const getNetValue = (val, unitName) => {
        if (!excludeVat || !val) return safeNum(val);
        return safeNum(val) / (1 + (VAT_RATES[unitName] ?? 0));
    };

    useEffect(() => {
        if (viewType === 'monthly') {
            setStartPeriod(0); setEndPeriod(11);
        } else if (viewType === 'weekly') {
            const idx = getLastWeekIndex();
            setStartPeriod(idx); setEndPeriod(idx);
        } else if (viewType === 'yearly') {
            setStartPeriod(0); setEndPeriod(1);
        }
    }, [viewType]);

    useEffect(() => {
        const load = async () => {
            const [
                sales25, sales25w, trans25, trans25w, spend25,
                sales24, sales24w, trans24, trans24w, spend24,
                sales26, sales26w, trans26, trans26w, spend26,
                budget25u, budget26u,
                raw2025, raw2026,
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
            setLoading(false);
        };
        load();
    }, []);

    const toggleUnit = (u) =>
        setSelectedUnits(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u]);

    const handlePredefinedPeriod = ({ target: { value: val } }) => {
        if (viewType === 'monthly') {
            const MAP = { q1:[0,2], q2:[3,5], q3:[6,8], q4:[9,11], summer:[3,9], ytd:[0, new Date().getMonth()] };
            if (MAP[val]) { setStartPeriod(MAP[val][0]); setEndPeriod(MAP[val][1]); }
        } else if (viewType === 'weekly') {
            const labels = selectedYear === '2026' ? WEEKLY_LABELS_2026 : WEEKLY_LABELS_2025;
            const last = labels.length - 1;
            const MAP = { q1:[0,12], q2:[13,25], q3:[26,38], q4:[39, last] };
            if (MAP[val]) { setStartPeriod(MAP[val][0]); setEndPeriod(MAP[val][1]); }
        }
    };

    const chartData = useMemo(() => {
        if (!rawData.sales25) return null;

        const is2026 = selectedYear === '2026';
        const currentSales  = is2026 ? rawData.sales26  : rawData.sales25;
        const currentSalesW = is2026 ? rawData.sales26w : rawData.sales25w;
        const currentTrans  = is2026 ? rawData.trans26  : rawData.trans25;
        const currentTransW = is2026 ? rawData.trans26w : rawData.trans25w;
        const currentSpend  = is2026 ? rawData.spend26  : rawData.spend25;
        const prevSales     = is2026 ? rawData.sales25  : rawData.sales24;
        const prevSalesW    = is2026 ? rawData.sales25w : rawData.sales24w;
        const prevTrans     = is2026 ? rawData.trans25  : rawData.trans24;
        const prevTransW    = is2026 ? rawData.trans25w : rawData.trans24w;
        const prevSpend     = is2026 ? rawData.spend25  : rawData.spend24;
        const currentBudget = is2026 ? rawData.budget26u : rawData.budget25u;
        const labelsList    = is2026 ? WEEKLY_LABELS_2026 : WEEKLY_LABELS_2025;
        const yearCurr = is2026 ? '2026' : '2025';
        const yearPrev = is2026 ? '2025' : '2024';
        const shortCurr = is2026 ? "'26" : "'25";
        const shortPrev = is2026 ? "'25" : "'24";

        // ── YEARLY ────────────────────────────────────────────────────────────
        if (viewType === 'yearly') {
            const labels = [yearPrev, yearCurr];
            const datasets = [];
            const yearlySpend = (sMap, tMap, u) => { const ts=sumArr(sMap[u]),tt=sumArr(tMap[u]); return tt>0?Math.round(ts/tt):0; };

            selectedUnits.filter(u => u !== 'All Groups').forEach((unit, i) => {
                const color = COLORS_ARRAY[i % COLORS_ARRAY.length];
                let dP, dC;
                if (metric==='sales') { dP=sumArr((prevSales[unit]||[]).map(v=>getNetValue(v,unit))); dC=sumArr((currentSales[unit]||[]).map(v=>getNetValue(v,unit))); }
                else if (metric==='transactions') { dP=sumArr(prevTrans[unit]); dC=sumArr(currentTrans[unit]); }
                else { dP=yearlySpend(prevSales,prevTrans,unit); dC=yearlySpend(currentSales,currentTrans,unit); }
                datasets.push({ label: unit, data:[dP,dC], backgroundColor:['#A9A9A9',color], borderColor:['#A9A9A9',color], borderWidth:2 });
            });

            if (selectedUnits.includes('All Groups')) {
                let tP=0,tC=0;
                if (metric==='spend') {
                    let sP=0,rP=0,sC=0,rC=0;
                    BUSINESS_UNITS.forEach(u=>{ sP+=sumArr(prevSales[u]);rP+=sumArr(prevTrans[u]);sC+=sumArr(currentSales[u]);rC+=sumArr(currentTrans[u]); });
                    tP=rP>0?Math.round(sP/rP):0; tC=rC>0?Math.round(sC/rC):0;
                } else {
                    const key=metric==='sales'?'sales':'trans';
                    const pK=is2026?`${key}25`:`${key}24`; const cK=is2026?`${key}26`:`${key}25`;
                    BUSINESS_UNITS.forEach(u=>{ tP+=sumArr(rawData[pK]?.[u]); tC+=sumArr(rawData[cK]?.[u]); });
                }
                datasets.push({ label:'All Groups', data:[tP,tC], backgroundColor:['#A9A9A9','#405846'], borderColor:['#A9A9A9','#405846'], borderWidth:3 });
            }
            return { labels, datasets };
        }

        // ── DAILY ────────────────────────────────────────────────────────────
        if (viewType === 'daily') {
            const labels = [];
            const start = new Date(dailyStart + 'T00:00:00');
            const end   = new Date(dailyEnd   + 'T00:00:00');
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1))
                labels.push(d.toISOString().split('T')[0]);

            const rawList = [...(rawData.raw2025||[]), ...(rawData.raw2026||[])];
            const getValue = (dateStr, unitName) => {
                const recs = rawList.filter(r => r.date === dateStr);
                if (unitName === 'All Groups')
                    return BUSINESS_UNITS.reduce((t,u) => t + getNetValue(recs.filter(r=>r.business_unit===u).reduce((s,r)=>s+safeNum(r.revenue),0), u), 0);
                return getNetValue(recs.filter(r=>r.business_unit===unitName).reduce((s,r)=>s+safeNum(r.revenue),0), unitName);
            };
            return { labels, datasets: selectedUnits.map(unit => ({ label: unit, data: labels.map(d=>getValue(d,unit)), borderColor: BU_COLORS[unit]||'#999', backgroundColor: BU_COLORS[unit]||'#999', tension:0.3, pointRadius:4, pointHoverRadius:6, borderWidth:2 })) };
        }

        // ── MONTHLY / WEEKLY ───────────────────────────────────────────────
        const labels = viewType === 'monthly'
            ? MONTHS.slice(startPeriod, endPeriod + 1)
            : labelsList.slice(startPeriod, endPeriod + 1);

        const getSlice = (sMap, tMap, spMap, sMapW, tMapW, unit) => {
            const sl = arr => (arr||[]).slice(startPeriod, endPeriod+1);
            if (viewType==='monthly') {
                if (metric==='sales') return sl((sMap[unit]||[]).map(v=>getNetValue(v,unit)));
                if (metric==='transactions') return sl(tMap[unit]);
                return sl(spMap[unit]);
            }
            if (metric==='sales') return sl((sMapW[unit]||[]).map(v=>getNetValue(v,unit)));
            if (metric==='transactions') return sl(tMapW[unit]);
            const s=sMapW[unit]||[]; const v=tMapW[unit]||[];
            return sl(s.map((val,i)=>v[i]>0?Math.round(getNetValue(val,unit)/v[i]):0));
        };

        const datasets = [];
        selectedUnits.filter(u=>u!=='All Groups').forEach((unit,i)=>{
            const color=COLORS_ARRAY[i%COLORS_ARRAY.length];
            datasets.push({ label:`${unit} ${shortCurr}`, data:getSlice(currentSales,currentTrans,currentSpend,currentSalesW,currentTransW,unit), borderColor:color, backgroundColor:color, tension:0.3, fill:false });
            if (compare24) datasets.push({ label:`${unit} ${shortPrev}`, data:getSlice(prevSales,prevTrans,prevSpend,prevSalesW,prevTransW,unit), borderColor:color, backgroundColor:color, borderDash:[5,5], borderWidth:2, tension:0.3, fill:false, pointRadius:0 });
            if (compareBudget && metric==='sales') {
                const bData=(currentBudget?.[unit]||[]).map(v=>getNetValue(v,unit));
                const bd=viewType==='monthly'?bData.slice(startPeriod,endPeriod+1):Array.from({length:endPeriod-startPeriod+1},(_,wi)=>Math.round((bData[WEEK_MONTH_MAP[startPeriod+wi]??0]||0)/4));
                datasets.push({ label:`${unit} Budget`, data:bd, borderColor:color, borderDash:[2,2], borderWidth:2, pointStyle:'rectRot', tension:0, fill:false });
            }
        });

        if (selectedUnits.includes('All Groups')) {
            const dLen=endPeriod-startPeriod+1;
            const aggC=new Array(dLen).fill(0), aggP=new Array(dLen).fill(0), aggB=new Array(dLen).fill(0);
            if (metric!=='spend') {
                BUSINESS_UNITS.forEach(unit=>{
                    getSlice(currentSales,currentTrans,currentSpend,currentSalesW,currentTransW,unit).forEach((v,i)=>{aggC[i]+=v;});
                    if (compare24) getSlice(prevSales,prevTrans,prevSpend,prevSalesW,prevTransW,unit).forEach((v,i)=>{aggP[i]+=v;});
                    if (compareBudget && metric==='sales') {
                        const bData=(currentBudget?.[unit]||[]).map(v=>getNetValue(v,unit));
                        const bd=viewType==='monthly'?bData.slice(startPeriod,endPeriod+1):Array.from({length:dLen},(_,wi)=>Math.round((bData[WEEK_MONTH_MAP[startPeriod+wi]??0]||0)/4));
                        bd.forEach((v,i)=>{aggB[i]+=v;});
                    }
                });
            } else {
                for (let i=0;i<dLen;i++) {
                    let ps=0,pt=0,ps2=0,pt2=0;
                    BUSINESS_UNITS.forEach(u=>{
                        const idx=startPeriod+i;
                        const [cS,cT]=viewType==='monthly'?[currentSales[u],currentTrans[u]]:[currentSalesW[u],currentTransW[u]];
                        const [pS,pT]=viewType==='monthly'?[prevSales[u],prevTrans[u]]:[prevSalesW[u],prevTransW[u]];
                        ps+=getNetValue(cS?.[idx]||0,u); pt+=cT?.[idx]||0;
                        ps2+=getNetValue(pS?.[idx]||0,u); pt2+=pT?.[idx]||0;
                    });
                    aggC[i]=pt>0?Math.round(ps/pt):0; aggP[i]=pt2>0?Math.round(ps2/pt2):0;
                }
            }
            datasets.unshift({ label:`All Groups ${shortCurr}`, data:aggC, borderColor:'#405846', backgroundColor:'#405846', tension:0.3, fill:false, borderWidth:3 });
            if (compare24) datasets.push({ label:`All Groups ${shortPrev}`, data:aggP, borderColor:'#A9A9A9', backgroundColor:'#A9A9A9', borderDash:[5,5], borderWidth:2, tension:0.3, fill:false });
            if (compareBudget&&metric==='sales') datasets.push({ label:'All Groups Budget', data:aggB, borderColor:'#6B7280', backgroundColor:'rgba(255,255,255,0.8)', borderWidth:2, tension:0, fill:true });
        }

        return { labels, datasets };
    }, [rawData, selectedUnits, metric, viewType, selectedYear, startPeriod, endPeriod, compare24, compareBudget, dailyStart, dailyEnd, excludeVat]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="text-center">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">Loading sales data…</p>
                </div>
            </div>
        );
    }

    return (
        <div id="page-details" className="animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-5">
                <h2 className="font-serif text-3xl font-semibold text-primary">Detailed Sales Analysis</h2>
            </div>

            <DetailsFilters
                selectedYear={selectedYear}   setSelectedYear={setSelectedYear}
                selectedUnits={selectedUnits} toggleUnit={toggleUnit}
                metric={metric}               setMetric={setMetric}
                viewType={viewType}           setViewType={setViewType}
                chartType={chartType}         setChartType={setChartType}
                startPeriod={startPeriod}     setStartPeriod={setStartPeriod}
                endPeriod={endPeriod}         setEndPeriod={setEndPeriod}
                dailyStart={dailyStart}       dailyEnd={dailyEnd}
                onDailyRangeChange={(start, end) => { setDailyStart(start); if (end) setDailyEnd(end); }}
                compare24={compare24}         setCompare24={setCompare24}
                compareBudget={compareBudget} setCompareBudget={setCompareBudget}
                excludeVat={excludeVat}       setExcludeVat={setExcludeVat}
                showLabels={showLabels}       setShowLabels={setShowLabels}
                setIsFullScreen={setIsFullScreen}
                handlePredefinedPeriod={handlePredefinedPeriod}
            />

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
                <DetailsChart
                    chartData={chartData}
                    chartType={chartType}
                    metric={metric}
                    showLabels={showLabels}
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
