import { Head } from '@inertiajs/react';

export default function Share({ imageUrl, shareUrl }) {
    const copy = async () => {
        await navigator.clipboard.writeText(shareUrl);
        alert('Share link copied');
    };

    return (
        <>
            <Head title="Shared Screenshot" />
            <div className="min-h-screen bg-slate-950 p-6 text-white">
                <div className="mx-auto max-w-6xl space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h1 className="text-2xl font-semibold">Shared Annotated Screenshot</h1>
                        <button onClick={copy} className="rounded bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Copy Share Link</button>
                    </div>
                    <img src={imageUrl} alt="Annotated screenshot" className="w-full rounded-xl border border-slate-800" />
                </div>
            </div>
        </>
    );
}
