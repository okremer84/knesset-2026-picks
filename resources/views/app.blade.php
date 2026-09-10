<!doctype html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>פנטזי בחירות לכנסת</title>
    @viteReactRefresh
    @vite('src/main.tsx')
</head>
<body><div id="root"></div></body>
</html>
