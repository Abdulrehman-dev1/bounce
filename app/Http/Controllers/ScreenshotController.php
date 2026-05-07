<?php

namespace App\Http\Controllers;

use App\Models\Screenshot;
use App\Rules\SafePublicUrl;
use App\Services\FramePolicyService;
use App\Services\ScreenshotCaptureService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class ScreenshotController extends Controller
{
    public function __construct(
        private readonly ScreenshotCaptureService $captureService,
        private readonly FramePolicyService $framePolicyService
    ) {}

    public function landing(): Response
    {
        return Inertia::render('Landing');
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'url' => ['required', 'string', new SafePublicUrl],
        ]);

        $framePolicy = $this->framePolicyService->assess($validated['url']);

        $mode = $framePolicy['embeddable'] ? 'live' : 'screenshot_fallback';
        $screenshotPath = null;

        if ($mode === 'screenshot_fallback') {
            $screenshotPath = $this->captureOriginal($validated['url']);
        }

        $screenshot = Screenshot::create([
            'original_url' => $validated['url'],
            'current_url' => $validated['url'],
            'screenshot_path' => $screenshotPath,
            'share_slug' => Str::random(12),
            'annotations_json' => [
                'lines' => [],
                'arrows' => [],
                'rects' => [],
                'ellipses' => [],
                'texts' => [],
            ],
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'page_scroll_x' => 0,
            'page_scroll_y' => 0,
            'mode' => $mode,
            'metadata' => [
                'frame_policy_reason' => $framePolicy['reason'],
            ],
        ]);

        return redirect()->route('screenshots.edit', $screenshot->id);
    }

    public function edit(Screenshot $screenshot): Response
    {
        return Inertia::render('Editor', [
            'screenshot' => [
                'id' => $screenshot->id,
                'original_url' => $screenshot->original_url,
                'current_url' => $screenshot->current_url ?? $screenshot->original_url,
                'mode' => $screenshot->mode,
                'frame_policy_reason' => $screenshot->metadata['frame_policy_reason'] ?? null,
                'annotations_json' => $screenshot->annotations_json ?? [],
                'viewport_width' => $screenshot->viewport_width ?? 1280,
                'viewport_height' => $screenshot->viewport_height ?? 800,
                'page_scroll_x' => $screenshot->page_scroll_x ?? 0,
                'page_scroll_y' => $screenshot->page_scroll_y ?? 0,
                'original_image_url' => $screenshot->screenshot_path ? route('screenshots.image', [$screenshot->id, 'original']) : null,
            ],
        ]);
    }

    public function snapshot(Request $request, Screenshot $screenshot): JsonResponse
    {
        $validated = $request->validate([
            'current_url' => ['required', 'string', new SafePublicUrl],
            'viewport_width' => ['required', 'integer', 'min:600', 'max:2400'],
            'viewport_height' => ['required', 'integer', 'min:400', 'max:2400'],
            'scroll_y' => ['nullable', 'integer', 'min:0', 'max:50000'],
        ]);

        $path = 'screenshots/original/'.Str::uuid()->toString().'.png';
        $absolutePath = storage_path('app/private/'.$path);

        if (! is_dir(dirname($absolutePath))) {
            mkdir(dirname($absolutePath), 0755, true);
        }

        $this->captureService->capture($validated['current_url'], $absolutePath, [
            'fullPage' => false,
            'viewportWidth' => $validated['viewport_width'],
            'viewportHeight' => $validated['viewport_height'],
            'scrollY' => $validated['scroll_y'] ?? 0,
        ]);

        $screenshot->update([
            'screenshot_path' => $path,
            'mode' => 'screenshot_fallback',
            'current_url' => $validated['current_url'],
            'viewport_width' => $validated['viewport_width'],
            'viewport_height' => $validated['viewport_height'],
            'page_scroll_y' => (int) ($validated['scroll_y'] ?? 0),
        ]);

        return response()->json([
            'image_url' => route('screenshots.image', [$screenshot->id, 'original']),
            'mode' => 'screenshot_fallback',
        ]);
    }

    public function save(Request $request, Screenshot $screenshot): RedirectResponse
    {
        $validated = $request->validate([
            'image' => ['nullable', 'string', 'regex:/^data:image\/png;base64,/'],
            'mode' => ['nullable', 'string', 'in:live,screenshot_fallback'],
            'current_url' => ['required', 'string', new SafePublicUrl],
            'annotations' => ['required', 'array'],
            'viewport_width' => ['required', 'integer', 'min:600', 'max:2400'],
            'viewport_height' => ['required', 'integer', 'min:400', 'max:2400'],
            'page_scroll_x' => ['nullable', 'integer', 'min:0'],
            'page_scroll_y' => ['nullable', 'integer', 'min:0'],
        ]);

        $annotatedPath = $screenshot->annotated_path;

        if (! empty($validated['image'])) {
            $raw = preg_replace('/^data:image\/png;base64,/', '', $validated['image']);
            $binary = base64_decode($raw ?? '', true);

            if ($binary === false || strlen($binary) > 15 * 1024 * 1024 || @getimagesizefromstring($binary) === false) {
                throw ValidationException::withMessages([
                    'image' => 'Invalid PNG payload.',
                ]);
            }

            $annotatedPath = 'screenshots/annotated/'.Str::uuid()->toString().'.png';
            Storage::disk('local')->put($annotatedPath, $binary);
        }

        $screenshot->update([
            'annotated_path' => $annotatedPath,
            'mode' => $validated['mode'] ?? $screenshot->mode,
            'current_url' => $validated['current_url'],
            'annotations_json' => $validated['annotations'],
            'viewport_width' => $validated['viewport_width'],
            'viewport_height' => $validated['viewport_height'],
            'page_scroll_x' => (int) ($validated['page_scroll_x'] ?? 0),
            'page_scroll_y' => (int) ($validated['page_scroll_y'] ?? 0),
        ]);

        return redirect()->route('screenshots.share', $screenshot->share_slug)
            ->with('success', 'Live annotations saved.');
    }

    public function shared(string $slug): Response
    {
        $screenshot = Screenshot::where('share_slug', $slug)->firstOrFail();

        $isFallback = $screenshot->mode === 'screenshot_fallback' || ! empty($screenshot->metadata['frame_policy_reason']);

        return Inertia::render('Share', [
            'shareUrl' => route('screenshots.share', $slug),
            'mode' => $isFallback ? 'screenshot_fallback' : 'live',
            'message' => $isFallback ? 'This website blocks live embedding, so this share is displayed as a captured screenshot.' : null,
            'currentUrl' => $screenshot->current_url ?? $screenshot->original_url,
            'viewportWidth' => $screenshot->viewport_width ?? 1280,
            'viewportHeight' => $screenshot->viewport_height ?? 800,
            'annotations' => $screenshot->annotations_json ?? [],
            'imageUrl' => $screenshot->annotated_path
                ? route('screenshots.image', [$screenshot->id, 'annotated'])
                : ($screenshot->screenshot_path ? route('screenshots.image', [$screenshot->id, 'original']) : null),
        ]);
    }

    public function image(Screenshot $screenshot, string $variant)
    {
        $path = match ($variant) {
            'original' => $screenshot->screenshot_path,
            'annotated' => $screenshot->annotated_path,
            default => null,
        };

        abort_unless($path, 404);

        return Storage::disk('local')->response($path);
    }

    private function captureOriginal(string $url): string
    {
        $fileName = Str::uuid()->toString().'.png';
        $relativePath = 'screenshots/original/'.$fileName;
        $absolutePath = storage_path('app/private/'.$relativePath);

        if (! is_dir(dirname($absolutePath))) {
            mkdir(dirname($absolutePath), 0755, true);
        }

        try {
            $this->captureService->capture($url, $absolutePath, ['fullPage' => true]);
        } catch (\Throwable) {
            throw ValidationException::withMessages([
                'url' => 'Screenshot capture failed. Please verify the URL and try again.',
            ]);
        }

        return $relativePath;
    }
}
