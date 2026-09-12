<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Prediction extends Model
{
    use HasUuids;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['seats' => 'array', 'turnout' => 'float'];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
