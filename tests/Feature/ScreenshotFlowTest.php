<?php

namespace Tests\Feature;

use App\Models\Screenshot;
use App\Services\FramePolicyService;
use App\Services\ScreenshotCaptureService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ScreenshotFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        FakeFramePolicyService::$embeddable = true;
        $this->app->bind(ScreenshotCaptureService::class, FakeCaptureService::class);
        $this->app->bind(FramePolicyService::class, FakeFramePolicyService::class);
        Storage::fake('local');
    }

    public function test_landing_page_is_available(): void
    {
        $this->get('/')->assertOk();
    }

    public function test_invalid_private_urls_are_blocked(): void
    {
        $this->post('/screenshots', ['url' => 'http://127.0.0.1'])->assertSessionHasErrors('url');
    }

    public function test_live_record_created_for_embeddable_site(): void
    {
        FakeFramePolicyService::$embeddable = true;
        $this->post('/screenshots', ['url' => 'https://example.com']);
        $shot = Screenshot::first();
        $this->assertSame('live', $shot->mode);
        $this->assertSame('https://example.com', $shot->current_url);
    }

    public function test_fallback_record_created_for_blocked_site(): void
    {
        FakeFramePolicyService::$embeddable = false;
        FakeFramePolicyService::$reason = 'x-frame-options';

        $this->post('/screenshots', ['url' => 'https://example.com']);
        $shot = Screenshot::first();

        $this->assertSame('remote_browser', $shot->mode);
    }

    public function test_can_save_annotations_json_and_share(): void
    {
        $shot = Screenshot::create([
            'original_url' => 'https://example.com',
            'current_url' => 'https://example.com/page',
            'share_slug' => 'share123',
            'mode' => 'live',
        ]);

        $png = 'data:image/png;base64,'.base64_encode(base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0XYAAAAASUVORK5CYII='));

        $this->post("/screenshots/{$shot->id}/save", [
            'image' => $png,
            'mode' => 'live',
            'current_url' => 'https://example.com/page',
            'annotations' => ['lines' => [], 'arrows' => [], 'rects' => [], 'ellipses' => [], 'texts' => []],
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'page_scroll_x' => 0,
            'page_scroll_y' => 0,
        ])->assertRedirect('/s/share123');

        $shot->refresh();
        $this->assertNotNull($shot->annotations_json);
        $this->assertNotNull($shot->annotated_path);
        Storage::disk('local')->assertExists($shot->annotated_path);
    }

    public function test_shared_page_loads(): void
    {
        $shot = Screenshot::create([
            'original_url' => 'https://example.com',
            'current_url' => 'https://example.com',
            'share_slug' => 'publicslug001',
            'mode' => 'live',
            'annotations_json' => ['lines' => []],
        ]);

        $this->get('/s/'.$shot->share_slug)->assertOk();
    }
}

class FakeCaptureService implements ScreenshotCaptureService
{
    public function capture(string $url, string $path, array $options = []): array
    {
        if (! is_dir(dirname($path))) {
            mkdir(dirname($path), 0755, true);
        }

        $pngData = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0XYAAAAASUVORK5CYII=');
        file_put_contents($path, $pngData);

        return ['width' => 1, 'height' => 1];
    }
}

class FakeFramePolicyService implements FramePolicyService
{
    public static bool $embeddable = true;

    public static ?string $reason = null;

    public function assess(string $url): array
    {
        return [
            'embeddable' => self::$embeddable,
            'reason' => self::$embeddable ? null : (self::$reason ?? 'x-frame-options'),
        ];
    }
}
