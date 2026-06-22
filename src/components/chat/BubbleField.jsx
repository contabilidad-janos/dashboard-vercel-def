import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Maximize2, X, RefreshCw } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/formatters';

/**
 * Cryptobubbles-style performance chart.
 *
 * Each entity is a bubble: SIZE encodes magnitude (revenue / units), COLOR
 * encodes growth (green = up, red = down). Bubbles float and collide via a
 * tiny in-house physics loop (no d3 dependency). Click a bubble to drill in.
 *
 * Spec shape:
 *   {
 *     type: 'bubble',
 *     title?: string,
 *     unit?: '€' | 'uds' | 'pax' | '',
 *     bubbles: [{ label, value, change?, sub? }],   // change in % (growth)
 *     drill?: string,                                // template, {label} placeholder
 *   }
 */

const fmtValue = (v, unit) => {
    if (!Number.isFinite(v)) return v;
    if (unit === '€') return formatCurrency(v);
    if (unit === '%') return `${Number(v).toFixed(1)}%`;
    return `${formatNumber(v)}${unit ? ' ' + unit : ''}`;
};

const fmtChange = (c) => (c == null || !Number.isFinite(c) ? '' : `${c >= 0 ? '+' : ''}${c.toFixed(1)}%`);

// Diverging colour: neutral → green for positive growth, neutral → red for negative.
const NEUTRAL = [196, 191, 170]; // #C4BFAA (brand neutral)
const GREEN = [76, 140, 99];
const RED = [201, 74, 70];
const mix = (a, b, t) => Math.round(a + (b - a) * t);
const changeColor = (change) => {
    if (change == null || !Number.isFinite(change)) return [169, 169, 169];
    const t = Math.max(0, Math.min(1, Math.abs(change) / 40)); // saturate at ±40%
    const to = change >= 0 ? GREEN : RED;
    return [mix(NEUTRAL[0], to[0], t), mix(NEUTRAL[1], to[1], t), mix(NEUTRAL[2], to[2], t)];
};

const shortLabel = (label, r) => {
    const max = Math.max(3, Math.round(r / 4));
    if (!label) return '';
    if (label.length <= max) return label;
    return label.slice(0, max - 1) + '…';
};

const BubbleScene = ({ bubbles, unit, height, onDrill, drillTemplate }) => {
    const wrapRef = useRef(null);
    const svgRef = useRef(null);
    const nodesRef = useRef([]);
    const groupRefs = useRef([]);
    const rafRef = useRef(null);
    const runningRef = useRef(true);
    const [width, setWidth] = useState(640);
    const [hover, setHover] = useState(null); // { i, x, y }

    // Radius scale (sqrt so area ~ value).
    const radii = useMemo(() => {
        const vals = bubbles.map(b => Math.abs(Number(b.value)) || 0);
        const maxV = Math.max(...vals, 1);
        const n = bubbles.length;
        // Shrink the range a little when there are many bubbles so they fit.
        const rMax = n > 16 ? 44 : n > 8 ? 54 : 64;
        const rMin = 18;
        return vals.map(v => rMin + (rMax - rMin) * Math.sqrt(v / maxV));
    }, [bubbles]);

    // Measure width responsively.
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const measure = () => setWidth(el.clientWidth || 640);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // (Re)seed node positions when data or canvas size changes.
    useEffect(() => {
        const W = width, H = height;
        nodesRef.current = bubbles.map((b, i) => {
            const r = radii[i];
            const angle = (i / bubbles.length) * Math.PI * 2;
            const spread = Math.min(W, H) * 0.28;
            return {
                x: W / 2 + Math.cos(angle) * spread + (Math.random() - 0.5) * 20,
                y: H / 2 + Math.sin(angle) * spread + (Math.random() - 0.5) * 20,
                vx: (Math.random() - 0.5) * 0.6,
                vy: (Math.random() - 0.5) * 0.6,
                r,
            };
        });
    }, [bubbles, radii, width, height]);

    // Physics loop: gravity to centre + collision separation + gentle drift.
    useEffect(() => {
        const W = width, H = height;
        const cx = W / 2, cy = H / 2;
        let frame = 0;

        const step = () => {
            const nodes = nodesRef.current;
            const n = nodes.length;
            for (let i = 0; i < n; i++) {
                const a = nodes[i];
                // gravity toward centre (weak), with a touch of brownian motion
                a.vx += (cx - a.x) * 0.0016 + (Math.random() - 0.5) * 0.08;
                a.vy += (cy - a.y) * 0.0016 + (Math.random() - 0.5) * 0.08;
            }
            // collision resolution
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    const a = nodes[i], b = nodes[j];
                    let dx = b.x - a.x, dy = b.y - a.y;
                    let dist = Math.hypot(dx, dy) || 0.01;
                    const minD = a.r + b.r + 2;
                    if (dist < minD) {
                        const push = (minD - dist) / dist * 0.5;
                        dx *= push; dy *= push;
                        a.x -= dx; a.y -= dy;
                        b.x += dx; b.y += dy;
                        a.vx -= dx * 0.12; a.vy -= dy * 0.12;
                        b.vx += dx * 0.12; b.vy += dy * 0.12;
                    }
                }
            }
            for (let i = 0; i < n; i++) {
                const a = nodes[i];
                a.vx *= 0.86; a.vy *= 0.86; // damping
                a.x += a.vx; a.y += a.vy;
                // keep inside walls (soft bounce)
                if (a.x < a.r) { a.x = a.r; a.vx *= -0.5; }
                if (a.x > W - a.r) { a.x = W - a.r; a.vx *= -0.5; }
                if (a.y < a.r) { a.y = a.r; a.vy *= -0.5; }
                if (a.y > H - a.r) { a.y = H - a.r; a.vy *= -0.5; }
                const g = groupRefs.current[i];
                if (g) g.setAttribute('transform', `translate(${a.x.toFixed(2)},${a.y.toFixed(2)})`);
            }
            frame++;
            // After settling, keep a calm idle but never fully stop (cryptobubbles feel).
            if (runningRef.current) rafRef.current = requestAnimationFrame(step);
        };

        runningRef.current = true;
        rafRef.current = requestAnimationFrame(step);

        // Pause when the chart scrolls out of view or the tab is hidden.
        const io = new IntersectionObserver(([e]) => {
            if (e.isIntersecting && !runningRef.current) {
                runningRef.current = true;
                rafRef.current = requestAnimationFrame(step);
            } else if (!e.isIntersecting) {
                runningRef.current = false;
                cancelAnimationFrame(rafRef.current);
            }
        }, { threshold: 0.05 });
        if (svgRef.current) io.observe(svgRef.current);
        const onVis = () => {
            if (document.hidden) { runningRef.current = false; cancelAnimationFrame(rafRef.current); }
            else if (!runningRef.current) { runningRef.current = true; rafRef.current = requestAnimationFrame(step); }
        };
        document.addEventListener('visibilitychange', onVis);

        return () => {
            runningRef.current = false;
            cancelAnimationFrame(rafRef.current);
            io.disconnect();
            document.removeEventListener('visibilitychange', onVis);
        };
    }, [width, height, bubbles.length]);

    // Re-energise the field (fun, like the original).
    const shuffle = () => {
        for (const a of nodesRef.current) {
            a.vx += (Math.random() - 0.5) * 14;
            a.vy += (Math.random() - 0.5) * 14;
        }
    };

    const drillFor = (label) =>
        (drillTemplate ? drillTemplate.replace('{label}', label) : `Break down "${label}" in more detail`);

    return (
        <div ref={wrapRef} className="relative w-full select-none">
            <button
                onClick={shuffle}
                className="absolute top-1 right-1 z-10 text-gray-300 hover:text-primary p-1 rounded-md hover:bg-gray-50 transition"
                title="Shake the bubbles"
            >
                <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <svg ref={svgRef} width={width} height={height} className="overflow-visible">
                {bubbles.map((b, i) => {
                    const r = radii[i];
                    const [cr, cg, cb] = changeColor(b.change);
                    const label = shortLabel(b.label, r);
                    const showText = r >= 24;
                    return (
                        <g
                            key={i}
                            ref={el => (groupRefs.current[i] = el)}
                            className="cursor-pointer"
                            style={{ transition: 'opacity .2s' }}
                            onMouseEnter={() => setHover({ i })}
                            onMouseMove={(e) => {
                                const box = wrapRef.current.getBoundingClientRect();
                                setHover({ i, x: e.clientX - box.left, y: e.clientY - box.top });
                            }}
                            onMouseLeave={() => setHover(null)}
                            onClick={() => onDrill && onDrill(drillFor(b.label))}
                        >
                            <circle
                                r={r}
                                fill={`rgba(${cr},${cg},${cb},0.18)`}
                                stroke={`rgb(${cr},${cg},${cb})`}
                                strokeWidth={hover?.i === i ? 3 : 2}
                            />
                            {showText && (
                                <>
                                    <text textAnchor="middle" dy={b.change != null ? '-0.1em' : '0.35em'}
                                        className="pointer-events-none"
                                        style={{ fontSize: Math.max(9, r / 4.5), fontWeight: 600, fill: `rgb(${cr},${cg},${cb})` }}>
                                        {label}
                                    </text>
                                    {b.change != null && Number.isFinite(b.change) && (
                                        <text textAnchor="middle" dy="1.1em" className="pointer-events-none"
                                            style={{ fontSize: Math.max(8, r / 5.5), fill: `rgb(${cr},${cg},${cb})` }}>
                                            {fmtChange(b.change)}
                                        </text>
                                    )}
                                </>
                            )}
                        </g>
                    );
                })}
            </svg>

            {hover && hover.x != null && (
                <div
                    className="absolute z-20 pointer-events-none bg-gray-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 shadow-lg"
                    style={{ left: hover.x + 12, top: hover.y + 12, maxWidth: 220 }}
                >
                    <div className="font-semibold">{bubbles[hover.i].label}</div>
                    <div>{fmtValue(Number(bubbles[hover.i].value), unit)}</div>
                    {bubbles[hover.i].change != null && Number.isFinite(bubbles[hover.i].change) && (
                        <div style={{ color: bubbles[hover.i].change >= 0 ? '#7CD09B' : '#F09B97' }}>
                            {fmtChange(bubbles[hover.i].change)} vs prev.
                        </div>
                    )}
                    {bubbles[hover.i].sub && <div className="text-gray-300">{bubbles[hover.i].sub}</div>}
                    <div className="text-gray-400 mt-0.5">Click to drill in →</div>
                </div>
            )}
        </div>
    );
};

const BubbleField = ({ spec, onDrill }) => {
    const [full, setFull] = useState(false);
    const bubbles = (spec.bubbles || []).filter(b => b && b.label != null && Number.isFinite(Number(b.value)));
    if (!bubbles.length) return null;

    const scene = (h) => (
        <BubbleScene
            bubbles={bubbles}
            unit={spec.unit}
            height={h}
            onDrill={onDrill}
            drillTemplate={spec.drill}
        />
    );

    return (
        <>
            <div className="bg-white border border-gray-200 rounded-lg p-4 my-3">
                <div className="flex items-start justify-between mb-1 gap-3">
                    {spec.title && <h4 className="text-sm font-serif text-primary">{spec.title}</h4>}
                    <button onClick={() => setFull(true)} className="text-gray-400 hover:text-primary p-1 -mt-1 -mr-1" title="Expand">
                        <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                </div>
                <p className="text-[10px] text-gray-400 mb-1">Size = amount · colour = growth (green up / red down) · click to drill</p>
                {scene(300)}
            </div>

            {full && (
                <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-6" onClick={() => setFull(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] p-6 flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between mb-3">
                            <h3 className="font-serif text-xl text-primary">{spec.title || 'Performance'}</h3>
                            <button onClick={() => setFull(false)} className="text-gray-400 hover:text-gray-700 p-1">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 min-h-0">{scene(520)}</div>
                    </div>
                </div>
            )}
        </>
    );
};

export default BubbleField;
