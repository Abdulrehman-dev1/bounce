<?php

namespace App\Providers;

use App\Services\BrowserShotScreenshotCaptureService;
use App\Services\FramePolicyService;
use App\Services\HttpFramePolicyService;
use App\Services\ScreenshotCaptureService;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(ScreenshotCaptureService::class, BrowserShotScreenshotCaptureService::class);
        $this->app->bind(FramePolicyService::class, HttpFramePolicyService::class);
    }

    public function boot(): void {}
}
