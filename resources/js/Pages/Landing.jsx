import { Head, useForm } from '@inertiajs/react';

export default function Landing() {
    const { data, setData, post, processing, errors } = useForm({ url: '' });

    const submit = (e) => {
        e.preventDefault();
        post('/screenshots');
    };

    return (
        <>
            <Head title="Live Website Annotator" />
            <div className="min-h-screen bg-slate-950 text-white">
                <div className="mx-auto max-w-5xl px-4 py-20">
                    <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Live Website Annotation Platform</h1>
                    <p className="mt-4 max-w-2xl text-slate-300">
                        Open website in live preview mode, browse and annotate. If site blocks embedding, we automatically fallback to snapshot mode.
                    </p>

                    <form onSubmit={submit} className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6">
                        <label className="block text-sm text-slate-300">Website URL</label>
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                            <input
                                type="url"
                                required
                                value={data.url}
                                onChange={(e) => setData('url', e.target.value)}
                                placeholder="https://example.com"
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none ring-cyan-400/60 placeholder:text-slate-500 focus:ring"
                            />
                            <button
                                type="submit"
                                disabled={processing}
                                className="rounded-lg bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {processing ? 'Preparing...' : 'Open Website'}
                            </button>
                        </div>
                        {errors.url && <p className="mt-3 text-sm text-rose-400">{errors.url}</p>}
                    </form>
                </div>
            </div>
        </>
    );
}
