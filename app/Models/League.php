<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class League extends Model
{
    use HasUuids;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['locks_at' => 'immutable_datetime', 'benchmark' => 'array', 'turnout' => 'float'];
    }

    public function users()
    {
        return $this->belongsToMany(User::class)->withTimestamps();
    }

    public function owner()
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function predictions()
    {
        return $this->hasMany(Prediction::class);
    }

    public function isLocked(): bool
    {
        return $this->stage !== 'voting_open' || now()->gte($this->locks_at);
    }
}
