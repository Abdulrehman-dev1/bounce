<?php

use App\Http\Controllers\RemoteBrowserController;
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

Route::get('/remote-browser', [RemoteBrowserController::class, 'playground'])->name('remote-browser.playground');
Route::post('/remote-browser/sessions', [RemoteBrowserController::class, 'createSession'])->name('remote-browser.sessions.create');
Route::post('/remote-browser/share/{slug}/session', [RemoteBrowserController::class, 'createShareSession'])->name('remote-browser.share.session');
Route::get('/remote-browser/sessions/{sessionId}/screenshot', [RemoteBrowserController::class, 'screenshot'])->name('remote-browser.sessions.screenshot');
Route::get('/remote-browser/sessions/{sessionId}/state', [RemoteBrowserController::class, 'state'])->name('remote-browser.sessions.state');
Route::post('/remote-browser/sessions/{sessionId}/{command}', [RemoteBrowserController::class, 'command'])
    ->whereIn('command', ['navigate', 'back', 'forward', 'reload', 'scroll', 'click', 'type', 'viewport', 'mousemove', 'mousedown', 'mouseup', 'key', 'keydown', 'keyup', 'stream-profile'])
    ->name('remote-browser.sessions.command');
Route::delete('/remote-browser/sessions/{sessionId}', [RemoteBrowserController::class, 'close'])->name('remote-browser.sessions.close');
