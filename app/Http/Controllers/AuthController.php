<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $r)
    {
        $r->merge(['email' => Str::lower(trim((string) $r->input('email')))]);
        $data = $r->validate(['name' => 'required|string|max:80', 'email' => 'required|email|max:254|unique:users', 'password' => ['required', 'confirmed', PasswordRule::min(12)]]);
        $user = User::create($data);
        Auth::login($user);
        $r->session()->regenerate();

        return response()->json(['user' => $user], 201);
    }

    public function login(Request $r)
    {
        $r->merge(['email' => Str::lower(trim((string) $r->input('email')))]);
        $data = $r->validate(['email' => 'required|email', 'password' => 'required|string']);
        if (! Auth::attempt($data)) {
            throw ValidationException::withMessages(['email' => 'האימייל או הסיסמה שגויים']);
        }
        $r->session()->regenerate();

        return ['user' => $r->user()];
    }

    public function logout(Request $r)
    {
        Auth::logout();
        $r->session()->invalidate();
        $r->session()->regenerateToken();

        return response()->noContent();
    }

    public function forgot(Request $r)
    {
        $r->merge(['email' => Str::lower(trim((string) $r->input('email')))]);
        $data = $r->validate(['email' => 'required|email']);
        Password::sendResetLink($data);

        return ['message' => 'אם החשבון קיים, נשלח קישור לאיפוס הסיסמה'];
    }

    public function reset(Request $r)
    {
        $r->merge(['email' => Str::lower(trim((string) $r->input('email')))]);
        $data = $r->validate(['token' => 'required', 'email' => 'required|email', 'password' => ['required', 'confirmed', PasswordRule::min(12)]]);
        $status = Password::reset($data, function (User $u, string $password) {
            $u->forceFill(['password' => Hash::make($password), 'remember_token' => Str::random(60)])->save();
            DB::table('sessions')->where('user_id', $u->id)->delete();
            event(new PasswordReset($u));
        });
        if ($status !== Password::PasswordReset) {
            throw ValidationException::withMessages(['email' => __($status)]);
        }

        return ['message' => 'הסיסמה עודכנה'];
    }
}
