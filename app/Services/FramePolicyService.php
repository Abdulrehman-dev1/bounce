<?php

namespace App\Services;

interface FramePolicyService
{
    /**
     * @return array{embeddable: bool, reason: string|null}
     */
    public function assess(string $url): array;
}
