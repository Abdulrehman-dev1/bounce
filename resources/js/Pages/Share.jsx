import { Head } from '@inertiajs/react';
import { Arrow, Ellipse, Layer, Line, Rect, Stage, Text } from 'react-konva';
import { useState } from 'react';

export default function Share({ mode, message, currentUrl, annotations, imageUrl, viewportWidth, viewportHeight, shareUrl }) {
    const [showAnnotations, setShowAnnotations] = useState(true);

    const copy = async () => {
        await navigator.clipboard.writeText(shareUrl);
        alert('Share link copied');
    };

    return (
        <>
            <Head title="Shared Annotation" />
            <div className="min-h-screen bg-slate-950 p-6 text-white">
                <div className="mx-auto max-w-6xl space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h1 className="text-2xl font-semibold">Shared Website Annotation</h1>
                        <div className="flex gap-2">
                            <button onClick={() => setShowAnnotations((s) => !s)} className="rounded bg-slate-700 px-4 py-2 text-sm font-semibold text-white">{showAnnotations ? 'Hide' : 'Show'} Annotations</button>
                            <button onClick={copy} className="rounded bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Copy Share Link</button>
                        </div>
                    </div>

                    {message && <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>}

                    <div className="relative rounded-xl border border-slate-700 bg-white" style={{ height: '78vh' }}>
                        {mode === 'live' ? (
                            <iframe title="Shared live preview" src={currentUrl} className="absolute inset-0 z-10 h-full w-full" sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts" />
                        ) : (
                            <img src={imageUrl} alt="Shared fallback screenshot" className="absolute inset-0 z-10 h-full w-full object-contain" />
                        )}

                        {showAnnotations && (
                            <div className="absolute inset-0 z-20 pointer-events-none">
                                <Stage width={viewportWidth || 1280} height={viewportHeight || 800}>
                                    <Layer>
                                        {(annotations?.lines || []).map((line, i) => <Line key={i} points={line.points} stroke={line.color} strokeWidth={line.strokeWidth} opacity={line.opacity} lineCap="round" lineJoin="round" globalCompositeOperation={line.erase ? 'destination-out' : 'source-over'} />)}
                                        {(annotations?.arrows || []).map((item, i) => <Arrow key={i} points={item.points} stroke={item.color} fill={item.color} strokeWidth={item.strokeWidth} opacity={item.opacity} />)}
                                        {(annotations?.rects || []).map((item, i) => <Rect key={i} x={item.x} y={item.y} width={item.width} height={item.height} stroke={item.color} strokeWidth={item.strokeWidth} opacity={item.opacity} fill="transparent" />)}
                                        {(annotations?.ellipses || []).map((item, i) => <Ellipse key={i} x={item.x} y={item.y} radiusX={item.radiusX} radiusY={item.radiusY} stroke={item.color} strokeWidth={item.strokeWidth} opacity={item.opacity} fill="transparent" />)}
                                        {(annotations?.texts || []).map((item, i) => <Text key={i} {...item} />)}
                                    </Layer>
                                </Stage>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
