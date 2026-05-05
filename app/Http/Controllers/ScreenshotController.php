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

        $screenshotPath = null;
        $metadata = [
            'mode' => $framePolicy['embeddable'] ? 'live' : 'screenshot',
            'frame_policy_reason' => $framePolicy['reason'],
            'current_url' => $validated['url'],
            'viewport' => ['width' => 1280, 'height' => 800],
            'scroll' => ['x' => 0, 'y' => 0],
            'annotations' => [],
        ];

        if (! $framePolicy['embeddable']) {
            $fileName = Str::uuid()->toString().'.png';
            $screenshotPath = 'screenshots/original/'.$fileName;
            $absolutePath = storage_path('app/private/'.$screenshotPath);

            if (! is_dir(dirname($absolutePath))) {
                mkdir(dirname($absolutePath), 0755, true);
            }

            try {
                $captureMeta = $this->captureService->capture($validated['url'], $absolutePath, ['fullPage' => true]);
                $metadata = [...$metadata, ...$captureMeta];
            } catch (\Throwable) {
                throw ValidationException::withMessages([
                    'url' => 'Screenshot capture failed. Please verify the URL and try again.',
                ]);
            }
        }

        $screenshot = Screenshot::create([
            'original_url' => $validated['url'],
            'screenshot_path' => $screenshotPath,
            'share_slug' => Str::random(12),
            'metadata' => $metadata,
        ]);

        return redirect()->route('screenshots.edit', $screenshot->id);
    }

    public function edit(Screenshot $screenshot): Response
    {
        $metadata = $screenshot->metadata ?? [];

        return Inertia::render('Editor', [
            'screenshot' => [
                'id' => $screenshot->id,
                'original_url' => $screenshot->original_url,
                'mode' => $metadata['mode'] ?? 'screenshot',
                'frame_policy_reason' => $metadata['frame_policy_reason'] ?? null,
                'current_url' => $metadata['current_url'] ?? $screenshot->original_url,
                'viewport' => $metadata['viewport'] ?? ['width' => 1280, 'height' => 800],
                'scroll' => $metadata['scroll'] ?? ['x' => 0, 'y' => 0],
                'original_image_url' => $screenshot->screenshot_path
                    ? route('screenshots.image', [$screenshot->id, 'original'])
                    : null,
                'annotated_image_url' => $screenshot->annotated_path
                    ? route('screenshots.image', [$screenshot->id, 'annotated'])
                    : null,
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

        $captureMeta = $this->captureService->capture($validated['current_url'], $absolutePath, [
            'fullPage' => false,
            'viewportWidth' => $validated['viewport_width'],
            'viewportHeight' => $validated['viewport_height'],
            'scrollY' => $validated['scroll_y'] ?? 0,
        ]);

        $metadata = $screenshot->metadata ?? [];
        $metadata['mode'] = 'screenshot';
        $metadata['current_url'] = $validated['current_url'];
        $metadata['viewport'] = ['width' => $validated['viewport_width'], 'height' => $validated['viewport_height']];
        $metadata['scroll'] = ['x' => 0, 'y' => (int) ($validated['scroll_y'] ?? 0)];
        $metadata = [...$metadata, ...$captureMeta];

        $screenshot->update([
            'screenshot_path' => $path,
            'metadata' => $metadata,
        ]);

        return response()->json([
            'image_url' => route('screenshots.image', [$screenshot->id, 'original']),
            'mode' => 'screenshot',
        ]);
    }

    public function save(Request $request, Screenshot $screenshot): RedirectResponse
    {
        $validated = $request->validate([
            'image' => ['required', 'string', 'regex:/^data:image\/png;base64,/'],
            'mode' => ['nullable', 'string', 'in:live,screenshot'],
            'current_url' => ['nullable', 'string'],
            'viewport' => ['nullable', 'array'],
            'scroll' => ['nullable', 'array'],
            'annotations' => ['nullable', 'array'],
        ]);

        $raw = preg_replace('/^data:image\/png;base64,/', '', $validated['image']);
        $binary = base64_decode($raw ?? '', true);

        if ($binary === false || strlen($binary) > 15 * 1024 * 1024 || @getimagesizefromstring($binary) === false) {
            throw ValidationException::withMessages([
                'image' => 'Invalid PNG payload.',
            ]);
        }

        $path = 'screenshots/annotated/'.Str::uuid()->toString().'.png';
        Storage::disk('local')->put($path, $binary);

        $metadata = $screenshot->metadata ?? [];
        $metadata['mode'] = $validated['mode'] ?? ($metadata['mode'] ?? 'screenshot');
        $metadata['current_url'] = $validated['current_url'] ?? ($metadata['current_url'] ?? $screenshot->original_url);
        $metadata['viewport'] = $validated['viewport'] ?? ($metadata['viewport'] ?? null);
        $metadata['scroll'] = $validated['scroll'] ?? ($metadata['scroll'] ?? null);
        $metadata['annotations'] = $validated['annotations'] ?? ($metadata['annotations'] ?? []);

        $screenshot->update([
            'annotated_path' => $path,
            'metadata' => $metadata,
        ]);

        return redirect()->route('screenshots.share', $screenshot->share_slug)
            ->with('success', 'Annotated screenshot saved.');
    }

    public function shared(string $slug): Response
    {
        $screenshot = Screenshot::where('share_slug', $slug)->firstOrFail();

        abort_unless($screenshot->annotated_path, 404);

        return Inertia::render('Share', [
            'shareUrl' => route('screenshots.share', $slug),
            'imageUrl' => route('screenshots.image', [$screenshot->id, 'annotated']),
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
}
