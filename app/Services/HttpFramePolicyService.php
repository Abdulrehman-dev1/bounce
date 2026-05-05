<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

class HttpFramePolicyService implements FramePolicyService
{
    public function assess(string $url): array
    {
        try {
            $response = Http::timeout(12)
                ->withHeaders(['User-Agent' => 'BounceAnnotator/1.0'])
                ->get($url);
        } catch (\Throwable) {
            return ['embeddable' => false, 'reason' => 'unreachable'];
        }

        $xFrame = strtolower((string) $response->header('X-Frame-Options', ''));
        if ($xFrame !== '' && (str_contains($xFrame, 'deny') || str_contains($xFrame, 'sameorigin'))) {
            return ['embeddable' => false, 'reason' => 'x-frame-options'];
        }

        $csp = strtolower((string) $response->header('Content-Security-Policy', ''));
        if ($csp !== '' && str_contains($csp, 'frame-ancestors')) {
            if (str_contains($csp, "frame-ancestors 'none'") || str_contains($csp, "frame-ancestors 'self'")) {
                return ['embeddable' => false, 'reason' => 'csp-frame-ancestors'];
            }
        }

        return ['embeddable' => true, 'reason' => null];
    }
}
