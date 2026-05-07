<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Screenshot extends Model
{
    use HasFactory;

    protected $fillable = [
        'original_url',
        'current_url',
        'screenshot_path',
        'annotated_path',
        'share_slug',
        'annotations_json',
        'viewport_width',
        'viewport_height',
        'page_scroll_x',
        'page_scroll_y',
        'mode',
        'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
        'annotations_json' => 'array',
    ];
}
