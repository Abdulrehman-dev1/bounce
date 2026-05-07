import { Head, router } from '@inertiajs/react';
import { useMemo, useRef, useState } from 'react';
import { Arrow, Ellipse, Layer, Line, Rect, Stage, Text } from 'react-konva';
import useImage from 'use-image';

const TOOLS = ['pointer', 'pen', 'highlighter', 'eraser', 'arrow', 'rect', 'ellipse', 'text'];

const emptyState = { lines: [], arrows: [], rects: [], ellipses: [], texts: [] };

const normalizeAnnotations = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ...emptyState };
    }

    return {
        lines: Array.isArray(value.lines) ? value.lines : [],
        arrows: Array.isArray(value.arrows) ? value.arrows : [],
        rects: Array.isArray(value.rects) ? value.rects : [],
        ellipses: Array.isArray(value.ellipses) ? value.ellipses : [],
        texts: Array.isArray(value.texts) ? value.texts : [],
    };
};

export default function Editor({ screenshot }) {
    const [currentUrl, setCurrentUrl] = useState(screenshot.current_url || screenshot.original_url);
    const [addressBar, setAddressBar] = useState(screenshot.current_url || screenshot.original_url);
    const [historyUrls, setHistoryUrls] = useState([screenshot.current_url || screenshot.original_url]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [activeTool, setActiveTool] = useState('pointer');
    const [color, setColor] = useState('#ef4444');
    const [strokeWidth, setStrokeWidth] = useState(4);
    const [opacity, setOpacity] = useState(1);
    const [drawing, setDrawing] = useState(false);
    const [dragStart, setDragStart] = useState(null);
    const [dragCurrent, setDragCurrent] = useState(null);
    const [state, setState] = useState(normalizeAnnotations(screenshot.annotations_json));
    const [history, setHistory] = useState([]);
    const [future, setFuture] = useState([]);
    const [snapshotImageUrl, setSnapshotImageUrl] = useState(screenshot.original_image_url);

    const [bg] = useImage(snapshotImageUrl || '', 'anonymous');
    const stageRef = useRef(null);
    const iframeWrapRef = useRef(null);

    const isPointerMode = activeTool === 'pointer';
    const isDrawingTool = !isPointerMode;

    const stageSize = useMemo(() => {
        if (screenshot.mode === 'screenshot_fallback') {
            return { width: bg?.width || screenshot.viewport_width || 1280, height: bg?.height || screenshot.viewport_height || 800 };
        }

        const rect = iframeWrapRef.current?.getBoundingClientRect();
        return {
            width: Math.round(rect?.width || screenshot.viewport_width || 1280),
            height: Math.round(rect?.height || screenshot.viewport_height || 800),
        };
    }, [bg, screenshot.mode, screenshot.viewport_width, screenshot.viewport_height]);

    const snapshot = (next) => {
        setHistory((h) => [...h, state]);
        setFuture([]);
        setState(next);
    };

    const pointer = () => stageRef.current?.getPointerPosition();

    const onDown = () => {
        if (!isDrawingTool) return;
        const pos = pointer();
        if (!pos) return;
        setDrawing(true);
        setDragStart(pos);
        setDragCurrent(pos);

        if (['pen', 'highlighter', 'eraser'].includes(activeTool)) {
            snapshot({
                ...state,
                lines: [...state.lines, {
                    type: activeTool,
                    points: [pos.x, pos.y],
                    pagePoints: [pos.x, pos.y],
                    color,
                    strokeWidth,
                    opacity: activeTool === 'highlighter' ? Math.min(opacity, 0.35) : opacity,
                    erase: activeTool === 'eraser',
                }],
            });
        }

        if (activeTool === 'text') {
            const text = window.prompt('Enter annotation text');
            if (text) {
                snapshot({ ...state, texts: [...state.texts, { type: 'text', x: pos.x, y: pos.y, pageX: pos.x, pageY: pos.y, text, color, opacity, fontSize: 22 }] });
            }
            setDrawing(false);
            setDragStart(null);
            setDragCurrent(null);
        }
    };

    const onMove = () => {
        if (!drawing || !isDrawingTool) return;
        const pos = pointer();
        if (!pos) return;
        setDragCurrent(pos);

        if (['pen', 'highlighter', 'eraser'].includes(activeTool)) {
            const lines = [...state.lines];
            const last = lines[lines.length - 1];
            last.points = last.points.concat([pos.x, pos.y]);
            last.pagePoints = last.pagePoints.concat([pos.x, pos.y]);
            setState({ ...state, lines });
        }
    };

    const onUp = () => {
        if (!drawing || !isDrawingTool) return;

        if (dragStart && dragCurrent) {
            if (activeTool === 'arrow') {
                snapshot({ ...state, arrows: [...state.arrows, { type: 'arrow', points: [dragStart.x, dragStart.y, dragCurrent.x, dragCurrent.y], pagePoints: [dragStart.x, dragStart.y, dragCurrent.x, dragCurrent.y], color, strokeWidth, opacity }] });
            }
            if (activeTool === 'rect') {
                snapshot({ ...state, rects: [...state.rects, { type: 'rect', x: dragStart.x, y: dragStart.y, pageX: dragStart.x, pageY: dragStart.y, width: dragCurrent.x - dragStart.x, height: dragCurrent.y - dragStart.y, color, strokeWidth, opacity }] });
            }
            if (activeTool === 'ellipse') {
                snapshot({ ...state, ellipses: [...state.ellipses, { type: 'ellipse', x: (dragStart.x + dragCurrent.x) / 2, y: (dragStart.y + dragCurrent.y) / 2, pageX: (dragStart.x + dragCurrent.x) / 2, pageY: (dragStart.y + dragCurrent.y) / 2, radiusX: Math.abs(dragCurrent.x - dragStart.x) / 2, radiusY: Math.abs(dragCurrent.y - dragStart.y) / 2, color, strokeWidth, opacity }] });
            }
        }

        setDrawing(false);
        setDragStart(null);
        setDragCurrent(null);
    };

    const undo = () => {
        if (!history.length) return;
        setFuture((f) => [state, ...f]);
        setState(history[history.length - 1]);
        setHistory((h) => h.slice(0, -1));
    };

    const redo = () => {
        if (!future.length) return;
        setHistory((h) => [...h, state]);
        setState(future[0]);
        setFuture((f) => f.slice(1));
    };

    const clearAll = () => snapshot(emptyState);

    const submitUrl = (e) => {
        e.preventDefault();
        const next = addressBar.trim();
        if (!next) return;
        setCurrentUrl(next);
        const updated = historyUrls.slice(0, historyIndex + 1).concat(next);
        setHistoryUrls(updated);
        setHistoryIndex(updated.length - 1);
    };

    const goBack = () => {
        if (historyIndex <= 0) return;
        const idx = historyIndex - 1;
        setHistoryIndex(idx);
        setCurrentUrl(historyUrls[idx]);
        setAddressBar(historyUrls[idx]);
    };

    const goForward = () => {
        if (historyIndex >= historyUrls.length - 1) return;
        const idx = historyIndex + 1;
        setHistoryIndex(idx);
        setCurrentUrl(historyUrls[idx]);
        setAddressBar(historyUrls[idx]);
    };

    const refresh = () => setCurrentUrl((u) => `${u.split('#')[0]}#${Date.now()}`);

    const exportPng = async () => {
        const overlay = stageRef.current?.toDataURL({ pixelRatio: 2 });
        if (!overlay) return null;

        if (screenshot.mode === 'screenshot_fallback') {
            return overlay;
        }

        const res = await window.axios.post(`/screenshots/${screenshot.id}/snapshot`, {
            current_url: currentUrl,
            viewport_width: stageSize.width,
            viewport_height: stageSize.height,
            scroll_y: 0,
        });

        const imgUrl = res.data.image_url;
        setSnapshotImageUrl(imgUrl);

        const baseImg = new Image();
        const overImg = new Image();
        const loaded = await Promise.all([
            new Promise((ok, fail) => { baseImg.onload = ok; baseImg.onerror = fail; baseImg.src = imgUrl; }),
            new Promise((ok, fail) => { overImg.onload = ok; overImg.onerror = fail; overImg.src = overlay; }),
        ]);
        if (!loaded) return null;

        const canvas = document.createElement('canvas');
        canvas.width = baseImg.width;
        canvas.height = baseImg.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(baseImg, 0, 0);
        ctx.drawImage(overImg, 0, 0, baseImg.width, baseImg.height);
        return canvas.toDataURL('image/png');
    };

    const save = async () => {
        const image = await exportPng();
        router.post(`/screenshots/${screenshot.id}/save`, {
            image,
            mode: screenshot.mode,
            current_url: currentUrl,
            annotations: state,
            viewport_width: stageSize.width,
            viewport_height: stageSize.height,
            page_scroll_x: 0,
            page_scroll_y: 0,
        });
    };

    const download = async () => {
        const image = await exportPng();
        if (!image) return;
        const a = document.createElement('a');
        a.href = image;
        a.download = `annotated-${screenshot.id}.png`;
        a.click();
    };

    return (
        <>
            <Head title="Live Annotator" />
            <div className="min-h-screen bg-slate-100 p-3 sm:p-4">
                <div className="sticky top-0 z-30 mx-auto max-w-[1600px] space-y-3 pb-2">
                    <form onSubmit={submitUrl} className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
                        <button type="button" onClick={goBack} disabled={historyIndex <= 0} className="rounded bg-slate-700 px-3 py-2 text-sm text-white disabled:opacity-40">Back</button>
                        <button type="button" onClick={goForward} disabled={historyIndex >= historyUrls.length - 1} className="rounded bg-slate-700 px-3 py-2 text-sm text-white disabled:opacity-40">Forward</button>
                        <button type="button" onClick={refresh} className="rounded bg-slate-700 px-3 py-2 text-sm text-white">Refresh</button>
                        <input value={addressBar} onChange={(e) => setAddressBar(e.target.value)} className="min-w-[320px] flex-1 rounded border border-slate-300 px-3 py-2 text-sm" />
                        <button type="submit" className="rounded bg-cyan-600 px-4 py-2 text-sm font-semibold text-white">Go</button>
                    </form>

                    {screenshot.frame_policy_reason && screenshot.mode === 'screenshot_fallback' && (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            This website blocks live embedding, so editor is running in screenshot mode.
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
                        {TOOLS.map((name) => <button type="button" key={name} onClick={() => setActiveTool(name)} className={`rounded px-3 py-1 text-sm ${activeTool === name ? 'bg-cyan-600 text-white' : 'bg-slate-200 text-slate-800'}`}>{name}</button>)}
                        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 rounded" />
                        <input type="range" min="1" max="24" value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} />
                        <input type="range" min="0.1" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
                        <button type="button" onClick={undo} className="rounded bg-slate-700 px-3 py-1 text-sm text-white">Undo</button>
                        <button type="button" onClick={redo} className="rounded bg-slate-700 px-3 py-1 text-sm text-white">Redo</button>
                        <button type="button" onClick={clearAll} className="rounded bg-rose-600 px-3 py-1 text-sm text-white">Clear</button>
                        <button type="button" onClick={download} className="rounded bg-emerald-600 px-3 py-1 text-sm text-white">Download PNG</button>
                        <button type="button" onClick={save} className="rounded bg-cyan-600 px-3 py-1 text-sm text-white">Save & Share</button>
                    </div>
                </div>

                <div ref={iframeWrapRef} className="relative mx-auto max-w-[1600px] rounded-xl border bg-white" style={{ height: '78vh' }}>
                    {screenshot.mode === 'live' ? (
                        <iframe
                            title="Live preview"
                            src={currentUrl}
                            className="absolute inset-0 z-10 h-full w-full"
                            sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts"
                            style={{ pointerEvents: isPointerMode ? 'auto' : 'none' }}
                        />
                    ) : (
                        <img src={snapshotImageUrl} alt="Fallback preview" className="absolute inset-0 z-10 h-full w-full object-contain" />
                    )}

                    <div className="absolute inset-0 z-20" style={{ pointerEvents: isDrawingTool ? 'auto' : 'none' }}>
                        <Stage ref={stageRef} width={stageSize.width} height={stageSize.height} onMouseDown={isDrawingTool ? onDown : undefined} onMouseMove={isDrawingTool ? onMove : undefined} onMouseUp={isDrawingTool ? onUp : undefined}>
                            <Layer>
                                {state.lines.map((line, i) => <Line key={i} points={line.points} stroke={line.color} strokeWidth={line.strokeWidth} opacity={line.opacity} lineCap="round" lineJoin="round" globalCompositeOperation={line.erase ? 'destination-out' : 'source-over'} />)}
                                {state.arrows.map((item, i) => <Arrow key={i} points={item.points} stroke={item.color} fill={item.color} strokeWidth={item.strokeWidth} opacity={item.opacity} />)}
                                {state.rects.map((item, i) => <Rect key={i} x={item.x} y={item.y} width={item.width} height={item.height} stroke={item.color} strokeWidth={item.strokeWidth} opacity={item.opacity} fill="transparent" />)}
                                {state.ellipses.map((item, i) => <Ellipse key={i} x={item.x} y={item.y} radiusX={item.radiusX} radiusY={item.radiusY} stroke={item.color} strokeWidth={item.strokeWidth} opacity={item.opacity} fill="transparent" />)}
                                {state.texts.map((item, i) => <Text key={i} {...item} />)}
                            </Layer>
                        </Stage>
                    </div>
                </div>
            </div>
        </>
    );
}
