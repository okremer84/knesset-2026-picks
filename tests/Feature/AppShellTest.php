<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AppShellTest extends TestCase
{
    use RefreshDatabase;

    public function test_application_serves_react_and_healthcheck(): void
    {
        $this->withoutVite()->get('/')->assertOk()->assertSee('id="root"', false);
        $this->get('/up')->assertOk();
    }
}
