<?php

return [
    'parties' => json_decode(file_get_contents(__DIR__.'/parties.json'), true, flags: JSON_THROW_ON_ERROR),
    'aliases' => json_decode(file_get_contents(__DIR__.'/poll-aliases.json'), true, flags: JSON_THROW_ON_ERROR),
    'mapping_from' => '2026-09-08',
    'source_url' => 'https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Israeli_legislative_election',
    'user_agent' => env('WIKI_USER_AGENT', 'KnessetFantasy/1.0 (https://github.com/okremer84/knesset-2026-picks)'),
];
