<?php

namespace App\Services;

interface ScreenshotCaptureService
{
    /**
     * @param  array{fullPage?: bool, viewportWidth?: int, viewportHeight?: int, scrollY?: int}  $options
     * @return array<string, mixed>
     */
    public function capture(string $url, string $path, array $options = []): array;
}
