<?php

namespace App\Http\Controllers;

use App\Models\Screenshot;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Inertia\Inertia;
use Inertia\Response;

class RemoteBrowserController extends Controller
{
    private function baseUrl(): string
    {
        return rtrim((string) config('services.remote_browser.url', env('REMOTE_BROWSER_URL', 'http://127.0.0.1:3100')), '/');
    }

    private function client()
    {
        return Http::connectTimeout(5)
            ->timeout(180)
            ->withHeaders([
                'x-remote-browser-secret' => (string) config('services.remote_browser.secret', env('REMOTE_BROWSER_SECRET', '')),
            ]);
    }

    public function playground(): Response
    {
        return Inertia::render('RemoteBrowser', [
            'wsUrl' => (string) config('services.remote_browser.ws_url', env('REMOTE_BROWSER_WS_URL', 'ws://127.0.0.1:3100')),
            'wsSecret' => (string) config('services.remote_browser.secret', env('REMOTE_BROWSER_SECRET', '')),
        ]);
    }

    public function createSession(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'url' => ['required', 'url'],
            'viewportWidth' => ['nullable', 'integer', 'min:800', 'max:3840'],
            'viewportHeight' => ['nullable', 'integer', 'min:600', 'max:2160'],
        ]);

        $response = $this->client()->post($this->baseUrl().'/sessions', [
            'url' => $validated['url'],
            'viewportWidth' => $validated['viewportWidth'] ?? null,
            'viewportHeight' => $validated['viewportHeight'] ?? null,
        ]);

        return response()->json($response->json(), $response->status());
    }

    public function createShareSession(string $slug): JsonResponse
    {
        $screenshot = Screenshot::where('share_slug', $slug)->firstOrFail();

        $response = $this->client()->post($this->baseUrl().'/sessions', [
            'url' => $screenshot->current_url ?? $screenshot->original_url,
        ]);

        $data = $response->json() ?? [];
        $data['page_scroll_y'] = $screenshot->page_scroll_y ?? 0;

        return response()->json($data, $response->status());
    }

    public function screenshot(string $sessionId)
    {
        $response = $this->client()->get($this->baseUrl()."/sessions/{$sessionId}/screenshot");
        $contentType = $response->header('Content-Type', 'image/jpeg');

        return response($response->body(), $response->status())
            ->header('Content-Type', $contentType)
            ->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            ->header('Pragma', 'no-cache')
            ->header('Expires', '0');
    }

    public function state(string $sessionId): JsonResponse
    {
        $response = $this->client()->get($this->baseUrl()."/sessions/{$sessionId}/state");

        return response()->json($response->json(), $response->status());
    }

    public function command(Request $request, string $sessionId, string $command): JsonResponse
    {
        $allowed = ['navigate', 'back', 'forward', 'reload', 'scroll', 'click', 'type', 'viewport', 'mousemove', 'mousedown', 'mouseup', 'key', 'keydown', 'keyup', 'stream-profile'];
        abort_unless(in_array($command, $allowed, true), 404);

        $response = $this->client()->post($this->baseUrl()."/sessions/{$sessionId}/{$command}", $request->all());

        return response()->json($response->json(), $response->status());
    }

    public function close(string $sessionId): JsonResponse
    {
        $response = Http::timeout(30)
            ->withHeaders([
                'x-remote-browser-secret' => (string) config('services.remote_browser.secret', env('REMOTE_BROWSER_SECRET', '')),
            ])
            ->delete($this->baseUrl()."/sessions/{$sessionId}");

        return response()->json($response->json(), $response->status());
    }
}
