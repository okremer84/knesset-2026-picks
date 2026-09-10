<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('polls:sync')->dailyAt('03:17')->timezone('Asia/Jerusalem')->withoutOverlapping(30)->onOneServer();
