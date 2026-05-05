<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Screenshot extends Model
{
    use HasFactory;

    protected $fillable = [
        'original_url',
        'screenshot_path',
        'annotated_path',
        'share_slug',
        'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
    ];
}
