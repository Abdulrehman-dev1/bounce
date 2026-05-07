import { Head, router } from '@inertiajs/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Arrow, Ellipse, Layer, Line, Rect, Stage, Text } from 'react-konva';
import useImage from 'use-image';

const TOOLS = ['pointer', 'pen', 'highlighter', 'eraser', 'arrow', 'rect', 'ellipse', 'text'];
const emptyState = { lines: [], arrows: [], rects: [], ellipses: [], texts: [] };

const normalize = (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { ...emptyState };
    return {
        lines: Array.isArray(v.lines) ? v.lines : [],
        arrows: Array.isArray(v.arrows) ? v.arrows : [],
        rects: Array.isArray(v.rects) ? v.rects : [],
        ellipses: Array.isArray(v.ellipses) ? v.ellipses : [],
        texts: Array.isArray(v.texts) ? v.texts : [],
    };
};

export default function Editor({ screenshot, remoteBrowser = {} }) {
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
    const [state, setState] = useState(normalize(screenshot.annotations_json));
    const [history, setHistory] = useState([]);
    const [future, setFuture] = useState([]);

    const [snapshotImageUrl, setSnapshotImageUrl] = useState(screenshot.original_image_url);
    const [remoteSessionId, setRemoteSessionId] = useState('');
    const [remoteFrameKey, setRemoteFrameKey] = useState(0);
    const [remoteStreamMode, setRemoteStreamMode] = useState('polling');
    const [remoteViewportFocused, setRemoteViewportFocused] = useState(false);
    const [remoteScroll, setRemoteScroll] = useState({ x: screenshot.page_scroll_x || 0, y: screenshot.page_scroll_y || 0 });
    const [remoteLoading, setRemoteLoading] = useState(false);

    const [bg] = useImage(snapshotImageUrl || '', 'anonymous');
    const stageRef = useRef(null);
    const viewportRef = useRef(null);
    const wsRef = useRef(null);
    const wsBlobUrlRef = useRef('');
    const wheelDeltaRef = useRef({ x: 0, y: 0 });
    const wheelTimerRef = useRef(null);
    const moveLockRef = useRef(false);
    const pressedKeysRef = useRef(new Set());

    const isPointerMode = activeTool === 'pointer';
    const isDrawingTool = !isPointerMode;
    const isRemoteMode = screenshot.mode === 'remote_browser';
    const isIframeMode = screenshot.mode === 'live';

    useEffect(() => {
        if (!isRemoteMode) return;
        let mounted = true;

        const start = async () => {
            try {
                const res = await window.axios.post('/remote-browser/sessions', { url: currentUrl });
                if (!mounted) return;
                setRemoteSessionId(res.data.sessionId);
                setRemoteFrameKey((v) => v + 1);
            } catch {
                // fallback to existing screenshot if remote worker unavailable
            }
        };

        start();

        return () => {
            mounted = false;
            if (remoteSessionId) {
                window.axios.delete(`/remote-browser/sessions/${remoteSessionId}`).catch(() => null);
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRemoteMode]);

    useEffect(() => () => {
        if (wheelTimerRef.current) {
            clearTimeout(wheelTimerRef.current);
            wheelTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!isRemoteMode || !remoteSessionId) return;
        if (remoteStreamMode === 'websocket') return;
        const t = setInterval(() => setRemoteFrameKey((v) => v + 1), 700);
        return () => clearInterval(t);
    }, [isRemoteMode, remoteSessionId, remoteStreamMode]);

    useEffect(() => {
        if (!isRemoteMode || !remoteSessionId) return;
        const base = (remoteBrowser.wsUrl || 'ws://127.0.0.1:3100').replace(/\/$/, '');
        const params = new URLSearchParams({ sessionId: remoteSessionId });
        if (remoteBrowser.wsSecret) {
            params.set('secret', remoteBrowser.wsSecret);
        }

        const socket = new WebSocket(`${base}/ws?${params.toString()}`);
        socket.binaryType = 'arraybuffer';
        socket.onopen = () => setRemoteStreamMode('websocket');
        socket.onmessage = (event) => {
            const blob = event.data instanceof Blob ? event.data : new Blob([event.data], { type: 'image/jpeg' });
            if (wsBlobUrlRef.current) {
                URL.revokeObjectURL(wsBlobUrlRef.current);
            }
            wsBlobUrlRef.current = URL.createObjectURL(blob);
            setRemoteFrameKey((v) => v + 1);
        };
        socket.onerror = () => setRemoteStreamMode('polling');
        socket.onclose = () => setRemoteStreamMode((prev) => (prev === 'websocket' ? 'polling' : prev));
        wsRef.current = socket;

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            if (wsBlobUrlRef.current) {
                URL.revokeObjectURL(wsBlobUrlRef.current);
                wsBlobUrlRef.current = '';
            }
        };
    }, [isRemoteMode, remoteSessionId, remoteBrowser.wsSecret, remoteBrowser.wsUrl]);

    const stageSize = useMemo(() => {
        if (isRemoteMode || isIframeMode) {
            const rect = viewportRef.current?.getBoundingClientRect();
            return {
                width: Math.round(rect?.width || screenshot.viewport_width || 1280),
                height: Math.round(rect?.height || screenshot.viewport_height || 800),
            };
        }

        return { width: bg?.width || screenshot.viewport_width || 1280, height: bg?.height || screenshot.viewport_height || 800 };
    }, [isRemoteMode, isIframeMode, bg, screenshot.viewport_width, screenshot.viewport_height]);

    const snapshot = (next) => {
        setHistory((h) => [...h, state]);
        setFuture([]);
        setState(next);
    };

    const pointer = () => stageRef.current?.getPointerPosition();
    const withPageY = (y) => y + (isRemoteMode ? remoteScroll.y : 0);
    const toScreenY = (pageY) => pageY - (isRemoteMode ? remoteScroll.y : 0);

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
                    points: [pos.x, withPageY(pos.y)],
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
                snapshot({ ...state, texts: [...state.texts, { type: 'text', x: pos.x, y: withPageY(pos.y), text, color, opacity, fontSize: 22 }] });
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
            last.points = last.points.concat([pos.x, withPageY(pos.y)]);
            setState({ ...state, lines });
        }
    };

    const onUp = () => {
        if (!drawing || !isDrawingTool) return;

        if (dragStart && dragCurrent) {
            if (activeTool === 'arrow') {
                snapshot({ ...state, arrows: [...state.arrows, { points: [dragStart.x, withPageY(dragStart.y), dragCurrent.x, withPageY(dragCurrent.y)], color, strokeWidth, opacity }] });
            }
            if (activeTool === 'rect') {
                snapshot({ ...state, rects: [...state.rects, { x: dragStart.x, y: withPageY(dragStart.y), width: dragCurrent.x - dragStart.x, height: dragCurrent.y - dragStart.y, color, strokeWidth, opacity }] });
            }
            if (activeTool === 'ellipse') {
                snapshot({ ...state, ellipses: [...state.ellipses, { x: (dragStart.x + dragCurrent.x) / 2, y: withPageY((dragStart.y + dragCurrent.y) / 2), radiusX: Math.abs(dragCurrent.x - dragStart.x) / 2, radiusY: Math.abs(dragCurrent.y - dragStart.y) / 2, color, strokeWidth, opacity }] });
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

    const clearAll = () => snapshot({ ...emptyState });

    const submitUrl = async (e) => {
        e.preventDefault();
        const next = addressBar.trim();
        if (!next) return;

        setCurrentUrl(next);
        const updated = historyUrls.slice(0, historyIndex + 1).concat(next);
        setHistoryUrls(updated);
        setHistoryIndex(updated.length - 1);

        if (isRemoteMode && remoteSessionId) {
            await window.axios.post(`/remote-browser/sessions/${remoteSessionId}/navigate`, { url: next });
            setRemoteFrameKey((v) => v + 1);
        }
    };

    const remoteCommand = async (cmd, payload = {}) => {
        if (!remoteSessionId) return;
        setRemoteLoading(true);
        try {
            const res = await window.axios.post(`/remote-browser/sessions/${remoteSessionId}/${cmd}`, payload);
            if (res.data?.scroll) {
                setRemoteScroll(res.data.scroll);
            }
        } finally {
            setRemoteLoading(false);
            setRemoteFrameKey((v) => v + 1);
        }
    };

    const goBack = async () => {
        if (isRemoteMode) {
            await remoteCommand('back');
            return;
        }

        if (historyIndex <= 0) return;
        const idx = historyIndex - 1;
        setHistoryIndex(idx);
        setCurrentUrl(historyUrls[idx]);
        setAddressBar(historyUrls[idx]);
    };

    const goForward = async () => {
        if (isRemoteMode) {
            await remoteCommand('forward');
            return;
        }

        if (historyIndex >= historyUrls.length - 1) return;
        const idx = historyIndex + 1;
        setHistoryIndex(idx);
        setCurrentUrl(historyUrls[idx]);
        setAddressBar(historyUrls[idx]);
    };

    const refresh = async () => {
        if (isRemoteMode) {
            await remoteCommand('reload');
            return;
        }
        setCurrentUrl((u) => `${u.split('#')[0]}#${Date.now()}`);
    };

    const remoteKey = async (key) => {
        if (!isRemoteMode || !remoteSessionId) return;
        await remoteCommand('key', { key });
    };

    const keyFromEvent = (event) => {
        if (event.key === ' ') return 'Space';
        if (event.key === 'Esc') return 'Escape';
        if (event.key.length === 1) return event.key;
        return event.key;
    };

    const handleRemoteKeyDown = async (event) => {
        if (!isRemoteMode || !isPointerMode || !remoteSessionId) return;
        const key = keyFromEvent(event);
        if (!key) return;
        event.preventDefault();
        if (pressedKeysRef.current.has(key)) return;
        pressedKeysRef.current.add(key);
        await window.axios.post(`/remote-browser/sessions/${remoteSessionId}/keydown`, { key });
    };

    const handleRemoteKeyUp = async (event) => {
        if (!isRemoteMode || !isPointerMode || !remoteSessionId) return;
        const key = keyFromEvent(event);
        if (!key) return;
        event.preventDefault();
        pressedKeysRef.current.delete(key);
        await window.axios.post(`/remote-browser/sessions/${remoteSessionId}/keyup`, { key });
    };

    const handleRemoteWheel = async (e) => {
        if (!isRemoteMode || !isPointerMode) return;
        e.preventDefault();
        wheelDeltaRef.current.x += e.deltaX;
        wheelDeltaRef.current.y += e.deltaY;

        if (wheelTimerRef.current) return;
        wheelTimerRef.current = setTimeout(async () => {
            wheelTimerRef.current = null;
            const payload = { ...wheelDeltaRef.current };
            wheelDeltaRef.current = { x: 0, y: 0 };
            await remoteCommand('scroll', { deltaX: payload.x, deltaY: payload.y });
        }, 80);
    };

    const handleRemoteClick = async (e) => {
        if (!isRemoteMode || !isPointerMode) return;
        const point = getRemotePoint(e);
        if (!point) return;
        await remoteCommand('click', point);
    };

    const getRemotePoint = (e) => {
        const img = e.currentTarget;
        const rect = img.getBoundingClientRect();
        const naturalW = img.naturalWidth || rect.width;
        const naturalH = img.naturalHeight || rect.height;
        const scale = Math.min(rect.width / naturalW, rect.height / naturalH);
        const drawW = naturalW * scale;
        const drawH = naturalH * scale;
        const offsetX = (rect.width - drawW) / 2;
        const offsetY = (rect.height - drawH) / 2;
        const localX = e.clientX - rect.left - offsetX;
        const localY = e.clientY - rect.top - offsetY;
        if (localX < 0 || localY < 0 || localX > drawW || localY > drawH) return null;
        return {
            x: (localX / drawW) * naturalW,
            y: (localY / drawH) * naturalH,
        };
    };

    const handleRemoteMouseMove = async (e) => {
        if (!isRemoteMode || !isPointerMode || moveLockRef.current) return;
        const point = getRemotePoint(e);
        if (!point) return;
        moveLockRef.current = true;
        try {
            await window.axios.post(`/remote-browser/sessions/${remoteSessionId}/mousemove`, point);
        } catch {
            // ignore transient move errors to keep interaction smooth
        } finally {
            setTimeout(() => {
                moveLockRef.current = false;
            }, 35);
        }
    };

    const handleRemoteMouseDown = async (e) => {
        if (!isRemoteMode || !isPointerMode) return;
        viewportRef.current?.focus();
        const point = getRemotePoint(e);
        if (!point) return;
        try {
            await window.axios.post(`/remote-browser/sessions/${remoteSessionId}/mousedown`, { ...point, button: 'left' });
        } catch {
            // ignore transient mouse down errors
        }
    };

    const handleRemoteMouseUp = async (e) => {
        if (!isRemoteMode || !isPointerMode) return;
        const point = getRemotePoint(e);
        if (!point) return;
        try {
            await window.axios.post(`/remote-browser/sessions/${remoteSessionId}/mouseup`, { ...point, button: 'left' });
        } catch {
            // ignore transient mouse up errors
        }
    };

    const exportPng = async () => {
        const overlay = stageRef.current?.toDataURL({ pixelRatio: 2 });
        if (!overlay) return null;

        if (!isRemoteMode && !isIframeMode) {
            return overlay;
        }

        let imgUrl = snapshotImageUrl;
        if (isRemoteMode && remoteSessionId) {
            imgUrl = `/remote-browser/sessions/${remoteSessionId}/screenshot?k=${Date.now()}`;
        } else {
            const res = await window.axios.post(`/screenshots/${screenshot.id}/snapshot`, {
                current_url: currentUrl,
                viewport_width: stageSize.width,
                viewport_height: stageSize.height,
                scroll_y: 0,
            });
            imgUrl = res.data.image_url;
        }

        const baseImg = new Image();
        const overImg = new Image();

        await Promise.all([
            new Promise((ok, fail) => { baseImg.onload = ok; baseImg.onerror = fail; baseImg.src = imgUrl; }),
            new Promise((ok, fail) => { overImg.onload = ok; overImg.onerror = fail; overImg.src = overlay; }),
        ]);

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
            page_scroll_x: remoteScroll.x || 0,
            page_scroll_y: remoteScroll.y || 0,
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

    const frameUrl = remoteSessionId ? `/remote-browser/sessions/${remoteSessionId}/screenshot?k=${remoteFrameKey}` : '';
    const activeFrameUrl = wsBlobUrlRef.current || frameUrl;

    return (
        <>
            <Head title="Live Annotator" />
            <div className="min-h-screen bg-slate-100 p-3 sm:p-4">
                <div className="sticky top-0 z-30 mx-auto max-w-[1600px] space-y-3 pb-2">
                    <form onSubmit={submitUrl} className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
                        <button type="button" onClick={goBack} className="rounded bg-slate-700 px-3 py-2 text-sm text-white">Back</button>
                        <button type="button" onClick={goForward} className="rounded bg-slate-700 px-3 py-2 text-sm text-white">Forward</button>
                        <button type="button" onClick={refresh} className="rounded bg-slate-700 px-3 py-2 text-sm text-white">Refresh</button>
                        <input value={addressBar} onChange={(e) => setAddressBar(e.target.value)} className="min-w-[320px] flex-1 rounded border border-slate-300 px-3 py-2 text-sm" />
                        <button type="submit" className="rounded bg-cyan-600 px-4 py-2 text-sm font-semibold text-white">Go</button>
                    </form>

                    {screenshot.mode === 'remote_browser' && (
                        <div className="rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm text-cyan-800">
                            Remote browser mode active ({remoteStreamMode === 'websocket' ? 'WebSocket live' : 'HTTP polling'}). {remoteLoading ? 'Syncing...' : 'Ready'}.
                            <span className={`ml-2 inline-flex rounded px-2 py-0.5 text-xs ${remoteViewportFocused ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-700 text-slate-100'}`}>
                                Keyboard: {remoteViewportFocused ? 'Active' : 'Inactive'}
                            </span>
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
                        {isRemoteMode && isPointerMode && ['Enter', 'Tab', 'Backspace', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].map((k) => (
                            <button key={k} type="button" onClick={() => remoteKey(k)} className="rounded bg-slate-700 px-2 py-1 text-xs text-white">{k}</button>
                        ))}
                    </div>
                </div>

                <div
                    ref={viewportRef}
                    className="relative mx-auto max-w-[1600px] overflow-hidden rounded-xl border bg-white outline-none"
                    style={{ height: '78vh' }}
                    onWheel={handleRemoteWheel}
                    tabIndex={0}
                    onKeyDown={handleRemoteKeyDown}
                    onKeyUp={handleRemoteKeyUp}
                    onFocus={() => setRemoteViewportFocused(true)}
                    onBlur={() => setRemoteViewportFocused(false)}
                >
                    {isRemoteMode ? (
                        remoteSessionId ? (
                            <img
                                src={activeFrameUrl}
                                alt="Remote stream"
                                className="absolute inset-0 z-10 h-full w-full object-fill"
                                onClick={handleRemoteClick}
                                onMouseMove={handleRemoteMouseMove}
                                onMouseDown={handleRemoteMouseDown}
                                onMouseUp={handleRemoteMouseUp}
                            />
                        ) : (
                            <div className="absolute inset-0 z-10 grid place-items-center text-slate-500">Starting remote browser...</div>
                        )
                    ) : isIframeMode ? (
                        <iframe title="Live preview" src={currentUrl} className="absolute inset-0 z-10 h-full w-full" sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts" style={{ pointerEvents: isPointerMode ? 'auto' : 'none' }} />
                    ) : (
                        <img src={snapshotImageUrl} alt="Fallback preview" className="absolute inset-0 z-10 h-full w-full object-contain" />
                    )}

                    <div className="absolute inset-0 z-20" style={{ pointerEvents: isDrawingTool ? 'auto' : 'none' }}>
                        <Stage ref={stageRef} width={stageSize.width} height={stageSize.height} onMouseDown={isDrawingTool ? onDown : undefined} onMouseMove={isDrawingTool ? onMove : undefined} onMouseUp={isDrawingTool ? onUp : undefined}>
                            <Layer>
                                {state.lines.map((line, i) => {
                                    const points = [];
                                    for (let j = 0; j < line.points.length; j += 2) {
                                        points.push(line.points[j], toScreenY(line.points[j + 1]));
                                    }
                                    return <Line key={i} points={points} stroke={line.color} strokeWidth={line.strokeWidth} opacity={line.opacity} lineCap="round" lineJoin="round" globalCompositeOperation={line.erase ? 'destination-out' : 'source-over'} />;
                                })}
                                {state.arrows.map((item, i) => <Arrow key={i} points={[item.points[0], toScreenY(item.points[1]), item.points[2], toScreenY(item.points[3])]} stroke={item.color} fill={item.color} strokeWidth={item.strokeWidth} opacity={item.opacity} />)}
                                {state.rects.map((item, i) => <Rect key={i} x={item.x} y={toScreenY(item.y)} width={item.width} height={item.height} stroke={item.color} strokeWidth={item.strokeWidth} opacity={item.opacity} fill="transparent" />)}
                                {state.ellipses.map((item, i) => <Ellipse key={i} x={item.x} y={toScreenY(item.y)} radiusX={item.radiusX} radiusY={item.radiusY} stroke={item.color} strokeWidth={item.strokeWidth} opacity={item.opacity} fill="transparent" />)}
                                {state.texts.map((item, i) => <Text key={i} {...item} y={toScreenY(item.y)} />)}
                            </Layer>
                        </Stage>
                    </div>
                </div>
            </div>
        </>
    );
}
