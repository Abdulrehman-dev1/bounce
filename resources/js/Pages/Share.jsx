import { Head } from '@inertiajs/react';
import { Arrow, Ellipse, Layer, Line, Rect, Stage, Text } from 'react-konva';
import { useEffect, useMemo, useRef, useState } from 'react';

export default function Share({ mode, message, currentUrl, annotations, imageUrl, viewportWidth, viewportHeight, pageScrollY, shareUrl, slug, remoteBrowser = {} }) {
    const [showAnnotations, setShowAnnotations] = useState(true);
    const [remoteSessionId, setRemoteSessionId] = useState('');
    const [remoteFrameKey, setRemoteFrameKey] = useState(0);
    const [remoteScrollY, setRemoteScrollY] = useState(pageScrollY || 0);
    const [remoteStreamMode, setRemoteStreamMode] = useState('polling');
    const wsRef = useRef(null);
    const wsBlobUrlRef = useRef('');
    const wheelDeltaRef = useRef({ x: 0, y: 0 });
    const wheelTimerRef = useRef(null);
    const viewportRef = useRef(null);
    const [viewportBox, setViewportBox] = useState({ width: 1280, height: 800 });

    const isRemote = mode === 'remote_browser';

    useEffect(() => {
        if (!isRemote) return;
        let mounted = true;

        const init = async () => {
            const res = await window.axios.post(`/remote-browser/share/${slug}/session`);
            if (!mounted) return;
            setRemoteSessionId(res.data.sessionId);
            setRemoteScrollY(res.data.page_scroll_y || 0);
            setRemoteFrameKey((k) => k + 1);
            await window.axios.post(`/remote-browser/sessions/${res.data.sessionId}/stream-profile`, { profile: 'fast' });
        };

        init().catch(() => null);

        return () => {
            mounted = false;
            if (remoteSessionId) {
                window.axios.delete(`/remote-browser/sessions/${remoteSessionId}`).catch(() => null);
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRemote, slug]);

    useEffect(() => () => {
        if (wheelTimerRef.current) {
            clearTimeout(wheelTimerRef.current);
            wheelTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        const node = viewportRef.current;
        if (!node) return;
        const update = () => {
            const rect = node.getBoundingClientRect();
            setViewportBox({
                width: Math.max(320, Math.floor(rect.width)),
                height: Math.max(320, Math.floor(rect.height)),
            });
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!isRemote || !remoteSessionId) return;
        if (remoteStreamMode === 'websocket') return;
        const timer = setInterval(() => setRemoteFrameKey((k) => k + 1), 700);
        return () => clearInterval(timer);
    }, [isRemote, remoteSessionId, remoteStreamMode]);

    useEffect(() => {
        if (!isRemote || !remoteSessionId) return;
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
            setRemoteFrameKey((k) => k + 1);
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
    }, [isRemote, remoteSessionId, remoteBrowser.wsSecret, remoteBrowser.wsUrl]);

    const frameUrl = useMemo(() => (remoteSessionId ? `/remote-browser/sessions/${remoteSessionId}/screenshot?k=${remoteFrameKey}` : ''), [remoteSessionId, remoteFrameKey]);
    const activeFrameUrl = wsBlobUrlRef.current || frameUrl;
    const baseWidth = viewportWidth || 1280;
    const baseHeight = viewportHeight || 800;
    const scale = Math.min(viewportBox.width / baseWidth, viewportBox.height / baseHeight);
    const renderWidth = Math.round(baseWidth * scale);
    const renderHeight = Math.round(baseHeight * scale);
    const offsetLeft = Math.max(0, Math.floor((viewportBox.width - renderWidth) / 2));
    const offsetTop = Math.max(0, Math.floor((viewportBox.height - renderHeight) / 2));

    const copy = async () => {
        await navigator.clipboard.writeText(shareUrl);
        alert('Share link copied');
    };

    const handleWheel = async (e) => {
        if (!isRemote || !remoteSessionId) return;
        e.preventDefault();
        wheelDeltaRef.current.x += e.deltaX;
        wheelDeltaRef.current.y += e.deltaY;

        if (wheelTimerRef.current) return;
        wheelTimerRef.current = setTimeout(async () => {
            wheelTimerRef.current = null;
            const payload = { ...wheelDeltaRef.current };
            wheelDeltaRef.current = { x: 0, y: 0 };
            const res = await window.axios.post(`/remote-browser/sessions/${remoteSessionId}/scroll`, {
                deltaX: payload.x,
                deltaY: payload.y,
            });
            setRemoteScrollY(res.data?.scroll?.y || 0);
            setRemoteFrameKey((k) => k + 1);
        }, 80);
    };

    const sy = (y) => y - (isRemote ? remoteScrollY : 0);

    return (
        <>
            <Head title="Shared Annotation" />
            <div className="min-h-screen overflow-x-hidden bg-slate-950 p-4 sm:p-6 text-white">
                <div className="mx-auto max-w-7xl space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h1 className="text-2xl font-semibold">Shared Website Annotation</h1>
                        <div className="flex gap-2">
                            <button onClick={() => setShowAnnotations((s) => !s)} className="rounded bg-slate-700 px-4 py-2 text-sm font-semibold text-white">{showAnnotations ? 'Hide' : 'Show'} Annotations</button>
                            <button onClick={copy} className="rounded bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Copy Share Link</button>
                        </div>
                    </div>

                    {message && <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>}

                    <div ref={viewportRef} className="relative overflow-hidden rounded-xl border border-slate-700 bg-slate-900" style={{ height: '78vh' }} onWheel={handleWheel}>
                        <div className="absolute" style={{ left: offsetLeft, top: offsetTop, width: renderWidth, height: renderHeight }}>
                            {isRemote ? (
                                remoteSessionId ? (
                                    <img src={activeFrameUrl} alt="Shared remote view" className="absolute inset-0 z-10 h-full w-full object-fill" />
                                ) : (
                                    <div className="absolute inset-0 z-10 grid place-items-center text-slate-300">Preparing shared remote view...</div>
                                )
                            ) : mode === 'live' ? (
                                <iframe title="Shared live preview" src={currentUrl} className="absolute inset-0 z-10 h-full w-full" sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts" />
                            ) : (
                                <img src={imageUrl} alt="Shared fallback screenshot" className="absolute inset-0 z-10 h-full w-full object-contain" />
                            )}

                            {showAnnotations && (
                                <div className="absolute inset-0 z-20 pointer-events-none">
                                    <Stage width={renderWidth} height={renderHeight} scaleX={scale} scaleY={scale}>
                                    <Layer>
                                        {(annotations?.lines || []).map((line, i) => {
                                            const points = [];
                                            for (let j = 0; j < line.points.length; j += 2) {
                                                points.push(line.points[j], sy(line.points[j + 1]));
                                            }
                                            return <Line key={i} points={points} stroke={line.color} strokeWidth={line.strokeWidth} opacity={line.opacity} lineCap="round" lineJoin="round" globalCompositeOperation={line.erase ? 'destination-out' : 'source-over'} />;
                                        })}
                                        {(annotations?.arrows || []).map((item, i) => <Arrow key={i} points={[item.points[0], sy(item.points[1]), item.points[2], sy(item.points[3])]} stroke={item.color} fill={item.color} strokeWidth={item.strokeWidth} opacity={item.opacity} />)}
                                        {(annotations?.rects || []).map((item, i) => <Rect key={i} x={item.x} y={sy(item.y)} width={item.width} height={item.height} stroke={item.color} strokeWidth={item.strokeWidth} opacity={item.opacity} fill="transparent" />)}
                                        {(annotations?.ellipses || []).map((item, i) => <Ellipse key={i} x={item.x} y={sy(item.y)} radiusX={item.radiusX} radiusY={item.radiusY} stroke={item.color} strokeWidth={item.strokeWidth} opacity={item.opacity} fill="transparent" />)}
                                        {(annotations?.texts || []).map((item, i) => <Text key={i} {...item} y={sy(item.y)} />)}
                                    </Layer>
                                    </Stage>
                                </div>
                            )}
                        </div>
                    </div>
                    {isRemote && (
                        <div className="text-xs text-slate-300">Remote share stream: {remoteStreamMode === 'websocket' ? 'WebSocket live' : 'HTTP polling'} | Profile: Fast</div>
                    )}
                </div>
            </div>
        </>
    );
}
