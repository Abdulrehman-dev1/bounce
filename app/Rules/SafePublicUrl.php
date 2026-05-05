<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class SafePublicUrl implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! filter_var($value, FILTER_VALIDATE_URL)) {
            $fail('The :attribute must be a valid URL.');

            return;
        }

        $parts = parse_url($value);

        if (! isset($parts['scheme']) || ! in_array(strtolower($parts['scheme']), ['http', 'https'], true)) {
            $fail('Only HTTP/HTTPS URLs are allowed.');

            return;
        }

        $host = strtolower($parts['host'] ?? '');

        if ($host === '' || in_array($host, ['localhost', '127.0.0.1', '::1'], true) || str_ends_with($host, '.local')) {
            $fail('Local addresses are not allowed.');

            return;
        }

        $ips = [];

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            $ips[] = $host;
        } else {
            $resolved = gethostbynamel($host) ?: [];
            $records = dns_get_record($host, DNS_A + DNS_AAAA) ?: [];

            foreach ($records as $record) {
                if (isset($record['ip'])) {
                    $resolved[] = $record['ip'];
                }
                if (isset($record['ipv6'])) {
                    $resolved[] = $record['ipv6'];
                }
            }

            $ips = array_values(array_unique($resolved));

            if ($ips === []) {
                $fail('The URL host could not be resolved.');

                return;
            }
        }

        foreach ($ips as $ip) {
            if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                $fail('Private or reserved network addresses are not allowed.');

                return;
            }
        }
    }
}
