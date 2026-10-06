<?php

namespace App\Models;

use Carbon\CarbonImmutable;
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

    public function effectiveDeadline(): CarbonImmutable
    {
        $cap = CarbonImmutable::parse(config('election.date').' 20:00', 'Asia/Jerusalem')->utc();

        return $this->locks_at->min($cap);
    }

    public function isLocked(): bool
    {
        return $this->stage !== 'voting_open' || now()->gte($this->effectiveDeadline());
    }
}
