import { Head, router } from '@inertiajs/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Arrow, Ellipse, Layer, Line, Rect, Stage, Text } from 'react-konva';
import useImage from 'use-image';

const TOOLS = ['pen', 'highlighter', 'eraser', 'arrow', 'rect', 'ellipse', 'text'];

const emptyAnnotations = () => ({ lines: [], arrows: [], rects: [], ellipses: [], texts: [] });

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

export default function Editor({ screenshot }) {
    const [renderMode, setRenderMode] = useState(screenshot.mode);
    const [isAnnotateMode, setIsAnnotateMode] = useState(false);
    const [iframeReady, setIframeReady] = useState(false);
    const [fallbackNotice, setFallbackNotice] = useState('');

    const initialUrl = screenshot.current_url || screenshot.original_url;
    const [currentUrl, setCurrentUrl] = useState(initialUrl);
    const [addressBar, setAddressBar] = useState(initialUrl);
    const [historyUrls, setHistoryUrls] = useState([initialUrl]);
    const [historyIndex, setHistoryIndex] = useState(0);

    const [snapshotImageUrl, setSnapshotImageUrl] = useState(screenshot.original_image_url);
    const [bg] = useImage(snapshotImageUrl || '', 'anonymous');

    const viewportRef = useRef(null);
    const stageRef = useRef(null);
    const [viewportSize, setViewportSize] = useState({ width: 1280, height: 760 });

    const [tool, setTool] = useState('pen');
    const [color, setColor] = useState('#ef4444');
    const [strokeWidth, setStrokeWidth] = useState(4);
    const [opacity, setOpacity] = useState(1);
    const [drawing, setDrawing] = useState(false);
    const [dragStart, setDragStart] = useState(null);
    const [dragCurrent, setDragCurrent] = useState(null);

    const [annotationStateByUrl, setAnnotationStateByUrl] = useState({ [initialUrl]: emptyAnnotations() });
    const [undoStackByUrl, setUndoStackByUrl] = useState({ [initialUrl]: [] });
    const [redoStackByUrl, setRedoStackByUrl] = useState({ [initialUrl]: [] });

    const state = annotationStateByUrl[currentUrl] ?? emptyAnnotations();
    const history = undoStackByUrl[currentUrl] ?? [];
    const future = redoStackByUrl[currentUrl] ?? [];

    useEffect(() => {
        const node = viewportRef.current;
        if (!node) return;

        const resize = () => {
            const rect = node.getBoundingClientRect();
            setViewportSize({ width: Math.max(640, Math.round(rect.width)), height: Math.max(420, Math.round(rect.height)) });
        };

        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(node);

        return () => observer.disconnect();
    }, [renderMode]);

    useEffect(() => {
        if (renderMode !== 'live') return;

        const t = setTimeout(() => {
            if (!iframeReady) {
                setRenderMode('screenshot');
                setFallbackNotice('Live preview appears blocked for this website. Switched to screenshot fallback mode.');
            }
        }, 6000);

        return () => clearTimeout(t);
    }, [renderMode, iframeReady, currentUrl]);

    const ensureUrlState = (url) => {
        setAnnotationStateByUrl((prev) => (prev[url] ? prev : { ...prev, [url]: emptyAnnotations() }));
        setUndoStackByUrl((prev) => (prev[url] ? prev : { ...prev, [url]: [] }));
        setRedoStackByUrl((prev) => (prev[url] ? prev : { ...prev, [url]: [] }));
    };

    const snapshot = (nextState) => {
        setUndoStackByUrl((prev) => ({ ...prev, [currentUrl]: [...(prev[currentUrl] ?? []), state] }));
        setRedoStackByUrl((prev) => ({ ...prev, [currentUrl]: [] }));
        setAnnotationStateByUrl((prev) => ({ ...prev, [currentUrl]: nextState }));
    };

    const pointer = () => stageRef.current?.getPointerPosition();

    const onDown = () => {
        if (!isAnnotateMode) return;
        const pos = pointer();
        if (!pos) return;

        setDrawing(true);
        setDragStart(pos);
        setDragCurrent(pos);

        if (['pen', 'highlighter', 'eraser'].includes(tool)) {
            snapshot({
                ...state,
                lines: [
                    ...state.lines,
                    {
                        points: [pos.x, pos.y],
                        color,
                        strokeWidth,
                        opacity: tool === 'highlighter' ? Math.min(opacity, 0.35) : opacity,
                        erase: tool === 'eraser',
                    },
                ],
            });
        }

        if (tool === 'text') {
            const text = window.prompt('Enter annotation text');
            if (text) {
                snapshot({ ...state, texts: [...state.texts, { x: pos.x, y: pos.y, text, color, opacity, fontSize: 22 }] });
            }
            setDrawing(false);
            setDragStart(null);
            setDragCurrent(null);
        }
    };

    const onMove = () => {
        if (!isAnnotateMode || !drawing) return;
        const pos = pointer();
        if (!pos) return;

        setDragCurrent(pos);

        if (['pen', 'highlighter', 'eraser'].includes(tool)) {
            const lines = [...state.lines];
            lines[lines.length - 1].points = lines[lines.length - 1].points.concat([pos.x, pos.y]);
            setAnnotationStateByUrl((prev) => ({ ...prev, [currentUrl]: { ...state, lines } }));
        }
    };

    const onUp = () => {
        if (!isAnnotateMode) return;

        if (drawing && dragStart && dragCurrent) {
            if (tool === 'arrow') {
                snapshot({ ...state, arrows: [...state.arrows, { points: [dragStart.x, dragStart.y, dragCurrent.x, dragCurrent.y], color, strokeWidth, opacity }] });
            }
            if (tool === 'rect') {
                snapshot({ ...state, rects: [...state.rects, { x: dragStart.x, y: dragStart.y, width: dragCurrent.x - dragStart.x, height: dragCurrent.y - dragStart.y, color, strokeWidth, opacity }] });
            }
            if (tool === 'ellipse') {
                snapshot({
                    ...state,
                    ellipses: [
                        ...state.ellipses,
                        {
                            x: (dragStart.x + dragCurrent.x) / 2,
                            y: (dragStart.y + dragCurrent.y) / 2,
                            radiusX: Math.abs(dragCurrent.x - dragStart.x) / 2,
                            radiusY: Math.abs(dragCurrent.y - dragStart.y) / 2,
                            color,
                            strokeWidth,
                            opacity,
                        },
                    ],
                });
            }
        }

        setDrawing(false);
        setDragStart(null);
        setDragCurrent(null);
    };

    const undo = () => {
        if (!history.length) return;
        const prev = history[history.length - 1];

        setRedoStackByUrl((map) => ({ ...map, [currentUrl]: [state, ...(map[currentUrl] ?? [])] }));
        setUndoStackByUrl((map) => ({ ...map, [currentUrl]: (map[currentUrl] ?? []).slice(0, -1) }));
        setAnnotationStateByUrl((map) => ({ ...map, [currentUrl]: prev }));
    };

    const redo = () => {
        if (!future.length) return;
        const next = future[0];

        setUndoStackByUrl((map) => ({ ...map, [currentUrl]: [...(map[currentUrl] ?? []), state] }));
        setRedoStackByUrl((map) => ({ ...map, [currentUrl]: (map[currentUrl] ?? []).slice(1) }));
        setAnnotationStateByUrl((map) => ({ ...map, [currentUrl]: next }));
    };

    const clearAll = () => snapshot(emptyAnnotations());

    const submitUrl = (e) => {
        e.preventDefault();
        const next = addressBar.trim();
        if (!next) return;

        ensureUrlState(next);
        setCurrentUrl(next);
        setIframeReady(false);

        const updated = historyUrls.slice(0, historyIndex + 1).concat(next);
        setHistoryUrls(updated);
        setHistoryIndex(updated.length - 1);
    };

    const goBack = () => {
        if (historyIndex <= 0) return;
        const idx = historyIndex - 1;
        const url = historyUrls[idx];

        ensureUrlState(url);
        setHistoryIndex(idx);
        setCurrentUrl(url);
        setAddressBar(url);
        setIframeReady(false);
    };

    const goForward = () => {
        if (historyIndex >= historyUrls.length - 1) return;
        const idx = historyIndex + 1;
        const url = historyUrls[idx];

        ensureUrlState(url);
        setHistoryIndex(idx);
        setCurrentUrl(url);
        setAddressBar(url);
        setIframeReady(false);
    };

    const refresh = () => {
        setIframeReady(false);
        setCurrentUrl((u) => `${u}${u.includes('?') ? '&' : '?'}_ts=${Date.now()}`);
    };

    const stageSize = useMemo(() => {
        if (renderMode === 'screenshot') {
            return { width: bg?.width || 1280, height: bg?.height || 800 };
        }
        return viewportSize;
    }, [renderMode, bg, viewportSize]);

    const buildExportImage = async () => {
        const overlayData = stageRef.current?.toDataURL({ pixelRatio: 2 });
        if (!overlayData) {
            window.alert('Annotation layer is not ready yet. Please try again.');
            return null;
        }

        if (renderMode === 'screenshot') {
            return overlayData;
        }

        let payload;
        try {
            const response = await window.axios.post(`/screenshots/${screenshot.id}/snapshot`, {
                current_url: addressBar,
                viewport_width: stageSize.width,
                viewport_height: stageSize.height,
                scroll_y: 0,
            });
            payload = response.data;
        } catch {
            window.alert('Unable to capture live snapshot for export. Please try again.');
            return null;
        }
        setSnapshotImageUrl(payload.image_url);

        const [baseImg, overlayImg] = await Promise.all([loadImage(payload.image_url), loadImage(overlayData)]);
        const canvas = document.createElement('canvas');
        canvas.width = baseImg.width;
        canvas.height = baseImg.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) return null;

        ctx.drawImage(baseImg, 0, 0);
        ctx.drawImage(overlayImg, 0, 0, baseImg.width, baseImg.height);

        return canvas.toDataURL('image/png');
    };

    const save = async () => {
        const image = await buildExportImage();
        if (!image) return;

        router.post(`/screenshots/${screenshot.id}/save`, {
            image,
            mode: renderMode,
            current_url: addressBar,
            viewport: { width: stageSize.width, height: stageSize.height },
            scroll: { x: 0, y: 0 },
            annotations: state,
        });
    };

    const download = async () => {
        const image = await buildExportImage();
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
                <div className="mx-auto max-w-[1600px] space-y-3">
                    <form onSubmit={submitUrl} className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
                        <button type="button" onClick={goBack} disabled={historyIndex <= 0} className="rounded bg-slate-700 px-3 py-2 text-sm text-white disabled:opacity-40">Back</button>
                        <button type="button" onClick={goForward} disabled={historyIndex >= historyUrls.length - 1} className="rounded bg-slate-700 px-3 py-2 text-sm text-white disabled:opacity-40">Forward</button>
                        <button type="button" onClick={refresh} className="rounded bg-slate-700 px-3 py-2 text-sm text-white">Refresh</button>
                        <input value={addressBar} onChange={(e) => setAddressBar(e.target.value)} className="min-w-[320px] flex-1 rounded border border-slate-300 px-3 py-2 text-sm" />
                        <button type="submit" className="rounded bg-cyan-600 px-4 py-2 text-sm font-semibold text-white">Go</button>
                        <button
                            type="button"
                            onClick={() => setIsAnnotateMode((v) => !v)}
                            className={`rounded px-4 py-2 text-sm font-semibold text-white ${isAnnotateMode ? 'bg-emerald-600' : 'bg-indigo-600'}`}
                        >
                            {isAnnotateMode ? 'Switch to Browse' : 'Switch to Annotate'}
                        </button>
                        <span className={`rounded px-3 py-1 text-xs font-semibold ${isAnnotateMode ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                            {isAnnotateMode ? 'Annotate Mode' : 'Browse Mode'}
                        </span>
                    </form>

                    {(fallbackNotice || (screenshot.frame_policy_reason && renderMode !== 'live')) && (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            {fallbackNotice || `Live embedding blocked (${screenshot.frame_policy_reason}). Running in screenshot fallback mode.`}
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
                        {TOOLS.map((name) => (
                            <button key={name} onClick={() => setTool(name)} className={`rounded px-3 py-1 text-sm ${tool === name ? 'bg-cyan-600 text-white' : 'bg-slate-200 text-slate-800'}`}>
                                {name}
                            </button>
                        ))}
                        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 rounded" />
                        <input type="range" min="1" max="24" value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} />
                        <input type="range" min="0.1" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
                        <button type="button" onClick={undo} className="rounded bg-slate-700 px-3 py-1 text-sm text-white">Undo</button>
                        <button type="button" onClick={redo} className="rounded bg-slate-700 px-3 py-1 text-sm text-white">Redo</button>
                        <button type="button" onClick={clearAll} className="rounded bg-rose-600 px-3 py-1 text-sm text-white">Clear</button>
                        <button type="button" onClick={download} className="rounded bg-emerald-600 px-3 py-1 text-sm text-white">Download PNG</button>
                        <button type="button" onClick={save} className="rounded bg-cyan-600 px-3 py-1 text-sm text-white">Save & Share</button>
                    </div>

                    {renderMode === 'live' ? (
                        <div ref={viewportRef} className="relative h-[78vh] overflow-hidden rounded-xl border bg-white">
                            <iframe
                                title="Live website preview"
                                src={currentUrl}
                                className="absolute inset-0 z-10 h-full w-full"
                                onLoad={() => setIframeReady(true)}
                                sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts"
                                style={{ pointerEvents: isAnnotateMode ? 'none' : 'auto' }}
                            />

                            <div className="absolute inset-0 z-20" style={{ pointerEvents: isAnnotateMode ? 'auto' : 'none' }}>
                                <Stage
                                    ref={stageRef}
                                    width={stageSize.width}
                                    height={stageSize.height}
                                    onMouseDown={isAnnotateMode ? onDown : undefined}
                                    onMouseMove={isAnnotateMode ? onMove : undefined}
                                    onMouseUp={isAnnotateMode ? onUp : undefined}
                                    style={{ pointerEvents: isAnnotateMode ? 'auto' : 'none' }}
                                >
                                    <Layer>
                                        {state.lines.map((line, i) => (
                                            <Line key={i} points={line.points} stroke={line.color} strokeWidth={line.strokeWidth} opacity={line.opacity} lineCap="round" lineJoin="round" globalCompositeOperation={line.erase ? 'destination-out' : 'source-over'} />
                                        ))}
                                        {state.arrows.map((item, i) => <Arrow key={i} points={item.points} stroke={item.color} fill={item.color} strokeWidth={item.strokeWidth} opacity={item.opacity} />)}
                                        {state.rects.map((item, i) => <Rect key={i} x={item.x} y={item.y} width={item.width} height={item.height} stroke={item.color} strokeWidth={item.strokeWidth} opacity={item.opacity} fill="transparent" />)}
                                        {state.ellipses.map((item, i) => <Ellipse key={i} x={item.x} y={item.y} radiusX={item.radiusX} radiusY={item.radiusY} stroke={item.color} strokeWidth={item.strokeWidth} opacity={item.opacity} fill="transparent" />)}
                                        {state.texts.map((item, i) => <Text key={i} {...item} />)}
                                    </Layer>
                                </Stage>
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-auto rounded-xl border bg-white p-3">
                            <Stage ref={stageRef} width={stageSize.width} height={stageSize.height} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}>
                                <Layer>{bg && <Rect x={0} y={0} width={bg.width} height={bg.height} fillPatternImage={bg} />}</Layer>
                                <Layer>
                                    {state.lines.map((line, i) => <Line key={i} points={line.points} stroke={line.color} strokeWidth={line.strokeWidth} opacity={line.opacity} lineCap="round" lineJoin="round" globalCompositeOperation={line.erase ? 'destination-out' : 'source-over'} />)}
                                    {state.arrows.map((item, i) => <Arrow key={i} points={item.points} stroke={item.color} fill={item.color} strokeWidth={item.strokeWidth} opacity={item.opacity} />)}
                                    {state.rects.map((item, i) => <Rect key={i} x={item.x} y={item.y} width={item.width} height={item.height} stroke={item.color} strokeWidth={item.strokeWidth} opacity={item.opacity} fill="transparent" />)}
                                    {state.ellipses.map((item, i) => <Ellipse key={i} x={item.x} y={item.y} radiusX={item.radiusX} radiusY={item.radiusY} stroke={item.color} strokeWidth={item.strokeWidth} opacity={item.opacity} fill="transparent" />)}
                                    {state.texts.map((item, i) => <Text key={i} {...item} />)}
                                </Layer>
                            </Stage>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
