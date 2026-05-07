<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('screenshots', function (Blueprint $table) {
            $table->text('current_url')->nullable()->after('original_url');
            $table->json('annotations_json')->nullable()->after('share_slug');
            $table->unsignedInteger('viewport_width')->nullable()->after('annotations_json');
            $table->unsignedInteger('viewport_height')->nullable()->after('viewport_width');
            $table->integer('page_scroll_x')->default(0)->after('viewport_height');
            $table->integer('page_scroll_y')->default(0)->after('page_scroll_x');
            $table->string('mode')->default('live')->after('page_scroll_y');
        });
    }

    public function down(): void
    {
        Schema::table('screenshots', function (Blueprint $table) {
            $table->dropColumn([
                'current_url',
                'annotations_json',
                'viewport_width',
                'viewport_height',
                'page_scroll_x',
                'page_scroll_y',
                'mode',
            ]);
        });
    }
};
