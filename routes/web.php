<?php

use App\Http\Controllers\ScreenshotController;
use Illuminate\Support\Facades\Route;

Route::get('/', [ScreenshotController::class, 'landing'])->name('landing');
Route::post('/screenshots', [ScreenshotController::class, 'store'])->name('screenshots.store');
Route::get('/screenshots/{screenshot}/edit', [ScreenshotController::class, 'edit'])->name('screenshots.edit');
Route::post('/screenshots/{screenshot}/snapshot', [ScreenshotController::class, 'snapshot'])->name('screenshots.snapshot');
Route::post('/screenshots/{screenshot}/save', [ScreenshotController::class, 'save'])->name('screenshots.save');
Route::get('/screenshots/{screenshot}/image/{variant}', [ScreenshotController::class, 'image'])
    ->whereIn('variant', ['original', 'annotated'])
    ->name('screenshots.image');
Route::get('/s/{slug}', [ScreenshotController::class, 'shared'])->name('screenshots.share');
