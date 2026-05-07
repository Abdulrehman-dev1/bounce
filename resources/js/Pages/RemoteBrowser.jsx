import { Head, router } from '@inertiajs/react';
import { useEffect, useMemo, useRef, useState } from 'react';

export default function RemoteBrowser({ wsUrl = 'ws://127.0.0.1:3100', wsSecret = '' }) {
    const [url, setUrl] = useState('https://www.apple.com');
    const [sessionId, setSessionId] = useState('');
    const [liveKey, setLiveKey] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [clickMode, setClickMode] = useState(true);
    const [typingText, setTypingText] = useState('');
    const [busy, setBusy] = useState(false);
    const [viewport, setViewport] = useState({ width: 1366, height: 900 });
    const [viewportSupported, setViewportSupported] = useState(true);
    const [streamMode, setStreamMode] = useState('polling');
    const [performanceMode, setPerformanceMode] = useState('fast');
    const [viewportFocused, setViewportFocused] = useState(false);
    const imageRef = useRef(null);
    const viewportRef = useRef(null);
    const wsRef = useRef(null);
    const wsBlobUrlRef = useRef('');
    const moveLockRef = useRef(false);
    const pressedKeysRef = useRef(new Set());
    const wheelDeltaRef = useRef({ x: 0, y: 0 });
    const wheelTimerRef = useRef(null);

    const imageUrl = useMemo(() => (sessionId ? `/remote-browser/sessions/${sessionId}/screenshot?k=${liveKey}` : ''), [sessionId, liveKey]);

    useEffect(() => {
        if (!sessionId || streamMode === 'websocket') return;
        const interval = setInterval(() => setLiveKey((v) => v + 1), 700);
        return () => clearInterval(interval);
    }, [sessionId, streamMode]);

    useEffect(() => {
        if (!sessionId) return;
        const base = wsUrl.replace(/\/$/, '');
        const params = new URLSearchParams({ sessionId });
        if (wsSecret) {
            params.set('secret', wsSecret);
        }
        const socket = new WebSocket(`${base}/ws?${params.toString()}`);
        socket.binaryType = 'arraybuffer';

        socket.onopen = () => {
            setStreamMode('websocket');
        };

        socket.onmessage = (event) => {
            const blob = event.data instanceof Blob ? event.data : new Blob([event.data], { type: 'image/jpeg' });
            if (wsBlobUrlRef.current) {
                URL.revokeObjectURL(wsBlobUrlRef.current);
            }
            wsBlobUrlRef.current = URL.createObjectURL(blob);
            setLiveKey((v) => v + 1);
        };

        socket.onerror = () => {
            setStreamMode('polling');
        };

        socket.onclose = () => {
            setStreamMode((prev) => (prev === 'websocket' ? 'polling' : prev));
        };

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
    }, [sessionId, wsUrl, wsSecret]);

    useEffect(() => {
        const node = viewportRef.current;
        if (!node) return;

        const update = () => {
            const rect = node.getBoundingClientRect();
            setViewport({
                width: Math.max(800, Math.floor(rect.width || 1366)),
                height: Math.max(600, Math.floor(rect.height || 900)),
            });
        };

        update();
        const observer = new ResizeObserver(update);
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    const startSession = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await window.axios.post('/remote-browser/sessions', {
                url,
                viewportWidth: viewport.width,
                viewportHeight: viewport.height,
            });
            setSessionId(res.data.sessionId);
            setLiveKey((v) => v + 1);
            void window.axios.post(`/remote-browser/sessions/${res.data.sessionId}/stream-profile`, { profile: performanceMode });
        } catch (e) {
            setError(e?.response?.data?.message || 'Failed to start remote session');
        } finally {
            setLoading(false);
        }
    };

    const send = async (command, payload = {}) => {
        if (!sessionId) return;
        setBusy(true);
        try {
            await window.axios.post(`/remote-browser/sessions/${sessionId}/${command}`, payload);
            setLiveKey((v) => v + 1);
            if (command === 'viewport') {
                setViewportSupported(true);
            }
        } catch (e) {
            if (command === 'viewport') {
                setViewportSupported(false);
                return;
            }
            if (['mousemove', 'mousedown', 'mouseup'].includes(command)) {
                return;
            }
            setError(e?.response?.data?.message || `Failed to run command: ${command}`);
        } finally {
            setBusy(false);
        }
    };

    const sendFast = async (command, payload = {}) => {
        if (!sessionId) return;
        try {
            await window.axios.post(`/remote-browser/sessions/${sessionId}/${command}`, payload);
            setLiveKey((v) => v + 1);
        } catch {
            // ignore transient fast-path failures
        }
    };

    const closeSession = async () => {
        if (!sessionId) return;
        await window.axios.delete(`/remote-browser/sessions/${sessionId}`);
        setSessionId('');
        setStreamMode('polling');
    };

    useEffect(() => {
        const node = viewportRef.current;
        if (!node || !sessionId) return;

        const onWheel = (event) => {
            event.preventDefault();
            wheelDeltaRef.current.x += event.deltaX;
            wheelDeltaRef.current.y += event.deltaY;
            if (wheelTimerRef.current) return;
            wheelTimerRef.current = setTimeout(() => {
                wheelTimerRef.current = null;
                const payload = { ...wheelDeltaRef.current };
                wheelDeltaRef.current = { x: 0, y: 0 };
                void sendFast('scroll', { deltaX: payload.x, deltaY: payload.y });
            }, 60);
        };

        node.addEventListener('wheel', onWheel, { passive: false });
        return () => node.removeEventListener('wheel', onWheel);
    }, [sessionId]);

    useEffect(() => {
        if (!sessionId || !viewportSupported) return;
        void send('viewport', {
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId, viewport.width, viewport.height, viewportSupported]);

    useEffect(() => {
        if (!sessionId) return;
        void sendFast('stream-profile', { profile: performanceMode });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId, performanceMode]);

    useEffect(() => () => {
        if (wheelTimerRef.current) {
            clearTimeout(wheelTimerRef.current);
            wheelTimerRef.current = null;
        }
    }, []);

    const toRemotePoint = (e) => {
        const image = imageRef.current;
        const viewport = viewportRef.current;
        if (!image || !viewport) return null;

        const viewportRect = viewport.getBoundingClientRect();
        const naturalW = image.naturalWidth || viewportRect.width;
        const naturalH = image.naturalHeight || viewportRect.height;
        const scale = Math.min(viewportRect.width / naturalW, viewportRect.height / naturalH);
        const drawW = naturalW * scale;
        const drawH = naturalH * scale;
        const offsetX = (viewportRect.width - drawW) / 2;
        const offsetY = (viewportRect.height - drawH) / 2;

        const localX = e.clientX - viewportRect.left - offsetX;
        const localY = e.clientY - viewportRect.top - offsetY;

        if (localX < 0 || localY < 0 || localX > drawW || localY > drawH) return null;

        const x = (localX / drawW) * naturalW;
        const y = (localY / drawH) * naturalH;
        return { x, y };
    };

    const handleMove = async (e) => {
        if (!sessionId || !clickMode || moveLockRef.current) return;
        const point = toRemotePoint(e);
        if (!point) return;
        moveLockRef.current = true;
        try {
            await sendFast('mousemove', point);
        } finally {
            setTimeout(() => {
                moveLockRef.current = false;
            }, 35);
        }
    };

    const handleMouseDown = async (e) => {
        if (!sessionId || !clickMode) return;
        viewportRef.current?.focus();
        const point = toRemotePoint(e);
        if (!point) return;
        await sendFast('mousedown', { ...point, button: 'left' });
    };

    const handleMouseUp = async (e) => {
        if (!sessionId || !clickMode) return;
        const point = toRemotePoint(e);
        if (!point) return;
        await sendFast('mouseup', { ...point, button: 'left' });
    };

    const typeIntoPage = async () => {
        if (!typingText.trim()) return;
        await send('type', { text: typingText });
    };

    const pressKey = async (key) => {
        await send('key', { key });
    };

    const holdKeyStart = async (key) => {
        await send('keydown', { key });
    };

    const holdKeyEnd = async (key) => {
        await send('keyup', { key });
    };

    const keyFromEvent = (event) => {
        if (event.key === ' ') return 'Space';
        if (event.key === 'Esc') return 'Escape';
        if (event.key.length === 1) return event.key;
        return event.key;
    };

    const handleViewportKeyDown = async (event) => {
        if (!sessionId || !clickMode) return;
        const key = keyFromEvent(event);
        if (!key) return;
        event.preventDefault();
        if (pressedKeysRef.current.has(key)) return;
        pressedKeysRef.current.add(key);
        await send('keydown', { key });
    };

    const handleViewportKeyUp = async (event) => {
        if (!sessionId || !clickMode) return;
        const key = keyFromEvent(event);
        if (!key) return;
        event.preventDefault();
        pressedKeysRef.current.delete(key);
        await send('keyup', { key });
    };

    const activeImageSrc = wsBlobUrlRef.current || imageUrl;
    const openEditor = () => {
        router.post('/screenshots', { url });
    };

    return (
        <>
            <Head title="Remote Browser MVP" />
            <div className="min-h-screen bg-slate-950 text-white p-4">
                <div className="mx-auto max-w-7xl space-y-3">
                    <h1 className="text-2xl font-semibold">Phase 1 Remote Browser (Playwright)</h1>
                    <p className="text-sm text-slate-300">Use this page to test blocked sites like Apple via server-side browser session.</p>

                    <div className="rounded-xl bg-slate-900 p-3 flex flex-wrap gap-2 items-center">
                        <input value={url} onChange={(e) => setUrl(e.target.value)} className="min-w-[320px] flex-1 rounded bg-slate-800 px-3 py-2 text-sm" />
                        <button onClick={startSession} disabled={loading} className="rounded bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">{loading ? 'Starting...' : 'Start Session'}</button>
                        <button onClick={() => send('back')} disabled={!sessionId} className="rounded bg-slate-700 px-4 py-2 text-sm">Back</button>
                        <button onClick={() => send('forward')} disabled={!sessionId} className="rounded bg-slate-700 px-4 py-2 text-sm">Forward</button>
                        <button onClick={() => send('reload')} disabled={!sessionId} className="rounded bg-slate-700 px-4 py-2 text-sm">Refresh</button>
                        <button onClick={() => send('navigate', { url })} disabled={!sessionId} className="rounded bg-indigo-500 px-4 py-2 text-sm">Go</button>
                        <button onClick={openEditor} className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900">Open Full Editor</button>
                        <button onClick={() => setClickMode((v) => !v)} disabled={!sessionId} className={`rounded px-4 py-2 text-sm ${clickMode ? 'bg-emerald-600' : 'bg-slate-700'}`}>{clickMode ? 'Click: ON' : 'Click: OFF'}</button>
                        <button onClick={closeSession} disabled={!sessionId} className="rounded bg-rose-600 px-4 py-2 text-sm">Close</button>
                    </div>
                    <div className="rounded-xl bg-slate-900 p-3 flex flex-wrap items-center gap-2">
                        <input value={typingText} onChange={(e) => setTypingText(e.target.value)} placeholder="Type text into focused remote input" className="min-w-[320px] flex-1 rounded bg-slate-800 px-3 py-2 text-sm" />
                        <button onClick={typeIntoPage} disabled={!sessionId || busy} className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">Type</button>
                        {['Enter', 'Tab', 'Backspace', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].map((k) => (
                            <button key={k} onClick={() => pressKey(k)} disabled={!sessionId || busy} className="rounded bg-slate-700 px-3 py-2 text-xs">{k}</button>
                        ))}
                        <button
                            disabled={!sessionId || busy}
                            onMouseDown={() => holdKeyStart('Space')}
                            onMouseUp={() => holdKeyEnd('Space')}
                            onMouseLeave={() => holdKeyEnd('Space')}
                            className="rounded bg-indigo-600 px-3 py-2 text-xs"
                        >
                            Hold Space
                        </button>
                        <span className="text-xs text-slate-300">
                            Stream: {streamMode === 'websocket' ? 'WebSocket live' : 'HTTP polling'} | wheel + click + type are sent to remote browser.
                        </span>
                        <div className="inline-flex overflow-hidden rounded border border-slate-600">
                            <button type="button" onClick={() => setPerformanceMode('balanced')} className={`px-2 py-1 text-xs ${performanceMode === 'balanced' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'}`}>Balanced</button>
                            <button type="button" onClick={() => setPerformanceMode('fast')} className={`px-2 py-1 text-xs ${performanceMode === 'fast' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'}`}>Fast</button>
                        </div>
                        <span className={`rounded px-2 py-1 text-xs ${viewportFocused ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-700 text-slate-200'}`}>
                            Keyboard: {viewportFocused ? 'Active' : 'Inactive'}
                        </span>
                    </div>

                    {error && <div className="rounded border border-rose-500 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</div>}
                    {!viewportSupported && (
                        <div className="rounded border border-amber-500 bg-amber-950/40 p-3 text-sm text-amber-200">
                            Viewport sync not supported by current worker process. Restart remote worker to enable full-fit interaction.
                        </div>
                    )}

                    <div className="rounded-xl bg-slate-900 p-3">
                        {!sessionId ? (
                            <div className="h-[70vh] grid place-items-center text-slate-400">Start a session to view remote browser stream.</div>
                        ) : (
                            <div
                                ref={viewportRef}
                                className="h-[70vh] overflow-hidden bg-black/30 outline-none"
                                tabIndex={0}
                                onKeyDown={handleViewportKeyDown}
                                onKeyUp={handleViewportKeyUp}
                                onFocus={() => setViewportFocused(true)}
                                onBlur={() => setViewportFocused(false)}
                            >
                                <img
                                    ref={imageRef}
                                    src={activeImageSrc}
                                    alt="Remote browser stream"
                                    className="h-full w-full rounded border border-slate-700 object-contain"
                                    onMouseMove={handleMove}
                                    onMouseDown={handleMouseDown}
                                    onMouseUp={handleMouseUp}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
