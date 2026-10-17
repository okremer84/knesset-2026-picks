<?php

return json_decode(file_get_contents(__DIR__.'/../data/campaign-opening-slate.json'), true, flags: JSON_THROW_ON_ERROR);
