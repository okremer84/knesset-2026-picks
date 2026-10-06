<?php

namespace App\Http\Controllers;

use App\Models\User;
use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\InvalidStateException;

class AuthController extends Controller
{
    public function config()
    {
        return ['googleEnabled' => $this->configured()];
    }

    private function configured(): bool
    {
        return filled(config('services.google.client_id'))
            && filled(config('services.google.client_secret'))
            && filled(config('services.google.redirect'));
    }

    public function redirect(Request $request)
    {
        // Carry only supported app parameters, never an arbitrary redirect URL.
        $params = $request->validate([
            'invite' => 'sometimes|string|max:255',
            'league' => 'sometimes|string|max:255',
        ]);
        $request->session()->put('google.return_params', $params);
        if (! $this->configured()) {
            return $this->returnToApp($request, 'unavailable');
        }

        return Socialite::driver('google')->redirect();
    }

    public function callback(Request $request)
    {
        if (! $this->configured()) {
            return $this->returnToApp($request, 'unavailable');
        }
        if ($request->has('error') || ! $request->filled('code')) {
            $request->session()->forget('state');

            return $this->returnToApp($request, 'failed');
        }
        try {
            // Stateful Socialite validates the one-time OAuth state before exchanging the code.
            $google = Socialite::driver('google')->user();
        } catch (InvalidStateException|GuzzleException $e) {
            return $this->returnToApp($request, 'failed');
        }
        $email = Str::lower(trim((string) $google->getEmail()));
        if (! $google->getId() || ($google->user['email_verified'] ?? false) !== true
            || ! filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
            return $this->returnToApp($request, 'failed');
        }

        // Google's stable subject identifies the account. Email alone cannot link legacy accounts.
        $user = User::where('google_id', $google->getId())->first();
        if (! $user) {
            if (User::where('email', $email)->exists()) {
                return $this->returnToApp($request, 'account_exists');
            }
            try {
                $user = new User;
                $user->forceFill([
                    'google_id' => $google->getId(),
                    'name' => Str::limit($google->getName() ?: Str::before($email, '@'), 80, ''),
                    'email' => $email,
                    'email_verified_at' => now(),
                    // Retain schema compatibility; no password authentication routes exist.
                    'password' => Str::random(64),
                ])->save();
            } catch (UniqueConstraintViolationException $e) {
                // Another callback may have created this same Google account concurrently.
                $user = User::where('google_id', $google->getId())->first();
                if (! $user) {
                    return $this->returnToApp($request, 'account_exists');
                }
            }
        }
        $avatar = $google->getAvatar();
        if (is_string($avatar) && filter_var($avatar, FILTER_VALIDATE_URL)
            && parse_url($avatar, PHP_URL_SCHEME) === 'https') {
            $user->google_avatar_url = $avatar;
            $user->save();
        }
        Auth::login($user);
        $request->session()->regenerate();

        return $this->returnToApp($request);
    }

    private function returnToApp(Request $request, ?string $error = null)
    {
        $params = $request->session()->pull('google.return_params', []);
        if ($error) {
            $params['auth_error'] = $error;
        }

        return redirect('/'.($params ? '?'.http_build_query($params) : ''));
    }

    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }
}
