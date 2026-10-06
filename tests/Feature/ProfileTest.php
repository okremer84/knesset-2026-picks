<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class ProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_profile_updates_require_authentication_and_only_change_own_name(): void
    {
        $this->postJson('/api/auth/profile', ['name' => 'New'])->assertUnauthorized();
        $user = User::factory()->create(['google_id' => 'subject']);
        $other = User::factory()->create();
        $this->actingAs($user)->postJson('/api/auth/profile', [
            'name' => 'נועה', 'id' => $other->id, 'email' => 'changed@example.org',
            'google_id' => 'different', 'avatar_data' => 'injected',
        ])->assertOk()->assertJsonPath('user.name', 'נועה')->assertJsonPath('user.email', $user->email)
            ->assertJsonMissingPath('user.avatar_data')->assertJsonMissingPath('user.google_id');
        $this->assertSame('subject', $user->fresh()->google_id);
        $this->assertNull($user->fresh()->avatar_data);
        $this->assertSame($other->name, $other->fresh()->name);
        $this->getJson('/api/auth/user')->assertJsonPath('user.name', 'נועה');
    }

    public function test_uploaded_photo_persists_and_takes_precedence_over_google_photo(): void
    {
        $user = User::factory()->create(['google_avatar_url' => 'https://example.org/google.jpg']);
        $file = UploadedFile::fake()->createWithContent('photo.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XsAAAAASUVORK5CYII='));
        $this->actingAs($user)->post('/api/auth/profile', ['name' => $user->name, 'avatar' => $file], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonMissingPath('user.avatar_data')->assertJsonMissingPath('user.google_avatar_url');
        $this->assertStringStartsWith('data:image/png;base64,', $user->fresh()->avatar_url);
        $this->postJson('/api/auth/profile', ['name' => 'Updated'])->assertOk();
        $this->getJson('/api/auth/user')->assertJsonPath('user.avatar_url', $user->fresh()->avatar_url);
    }

    public function test_invalid_names_and_unsafe_or_oversized_files_are_rejected(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        foreach (['', str_repeat('a', 81)] as $name) {
            $this->postJson('/api/auth/profile', ['name' => $name])->assertUnprocessable();
        }
        foreach ([UploadedFile::fake()->create('photo.jpg', 257, 'image/jpeg'), UploadedFile::fake()->createWithContent('photo.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>')] as $file) {
            $this->post('/api/auth/profile', ['name' => 'Updated', 'avatar' => $file], ['Accept' => 'application/json'])->assertUnprocessable();
        }
        $this->assertSame($user->name, $user->fresh()->name);
        $this->assertNull($user->fresh()->avatar_data);
    }
}
