<?php

namespace App\Services;

use Spatie\Browsershot\Browsershot;

class BrowserShotScreenshotCaptureService implements ScreenshotCaptureService
{
    public function capture(string $url, string $path, array $options = []): array
    {
        $shot = Browsershot::url($url)
            ->timeout(120)
            ->windowSize((int) ($options['viewportWidth'] ?? 1366), (int) ($options['viewportHeight'] ?? 900));

        if (($options['fullPage'] ?? true) === true) {
            $shot->fullPage();
        }

        $scrollY = (int) ($options['scrollY'] ?? 0);
        if ($scrollY > 0) {
            $shot->setOption('clip', [
                'x' => 0,
                'y' => $scrollY,
                'width' => (int) ($options['viewportWidth'] ?? 1366),
                'height' => (int) ($options['viewportHeight'] ?? 900),
            ]);
        }

        $shot->save($path);

        [$width, $height] = getimagesize($path) ?: [null, null];

        return [
            'width' => $width,
            'height' => $height,
            'captured_at' => now()->toIso8601String(),
            'scroll_y' => $scrollY,
        ];
    }
}
