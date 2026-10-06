<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class ProfileController extends Controller
{
    public function update(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:80',
            'avatar' => 'sometimes|file|image|mimes:jpg,jpeg,png,webp|max:256|dimensions:max_width=1024,max_height=1024',
        ]);
        $user = $request->user();
        $user->name = $data['name'];
        if ($request->hasFile('avatar')) {
            $file = $request->file('avatar');
            $user->avatar_data = 'data:'.$file->getMimeType().';base64,'.base64_encode($file->getContent());
        }
        $user->save();

        return ['user' => $user];
    }
}
