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
        $this->post('/screenshots', ['url' => 'http://127.0.0.1'])
            ->assertSessionHasErrors('url');
    }

    public function test_non_http_scheme_is_blocked(): void
    {
        $this->post('/screenshots', ['url' => 'file:///etc/passwd'])
            ->assertSessionHasErrors('url');
    }

    public function test_live_iframe_mode_record_is_created_when_site_is_embeddable(): void
    {
        FakeFramePolicyService::$embeddable = true;

        $response = $this->post('/screenshots', ['url' => 'https://example.com']);
        $shot = Screenshot::first();

        $response->assertRedirect("/screenshots/{$shot->id}/edit");
        $this->assertNull($shot->screenshot_path);
        $this->assertSame('live', $shot->metadata['mode']);
    }

    public function test_screenshot_fallback_mode_is_created_when_iframe_is_blocked(): void
    {
        FakeFramePolicyService::$embeddable = false;
        FakeFramePolicyService::$reason = 'x-frame-options';

        $this->post('/screenshots', ['url' => 'https://example.com']);
        $shot = Screenshot::first();

        $this->assertNotNull($shot->screenshot_path);
        $this->assertSame('screenshot', $shot->metadata['mode']);
        $this->assertSame('x-frame-options', $shot->metadata['frame_policy_reason']);
    }

    public function test_snapshot_endpoint_returns_image_for_live_mode(): void
    {
        $shot = Screenshot::create([
            'original_url' => 'https://example.com',
            'screenshot_path' => null,
            'share_slug' => 'snap123slug',
            'metadata' => ['mode' => 'live', 'current_url' => 'https://example.com'],
        ]);

        $this->postJson("/screenshots/{$shot->id}/snapshot", [
            'current_url' => 'https://example.com',
            'viewport_width' => 1200,
            'viewport_height' => 800,
            'scroll_y' => 0,
        ])->assertOk()->assertJsonStructure(['image_url', 'mode']);
    }

    public function test_can_save_annotated_image(): void
    {
        $shot = Screenshot::create([
            'original_url' => 'https://example.com',
            'screenshot_path' => 'screenshots/original/example.png',
            'share_slug' => 'abc123slug',
            'metadata' => ['mode' => 'screenshot'],
        ]);

        $png = 'data:image/png;base64,'.base64_encode(base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0XYAAAAASUVORK5CYII='));

        $this->post("/screenshots/{$shot->id}/save", ['image' => $png, 'mode' => 'live'])
            ->assertRedirect('/s/abc123slug');

        $shot->refresh();
        $this->assertNotNull($shot->annotated_path);
        Storage::disk('local')->assertExists($shot->annotated_path);
    }

    public function test_public_share_page_is_accessible(): void
    {
        $shot = Screenshot::create([
            'original_url' => 'https://example.com',
            'screenshot_path' => 'screenshots/original/example.png',
            'annotated_path' => 'screenshots/annotated/example.png',
            'share_slug' => 'publicslug001',
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
