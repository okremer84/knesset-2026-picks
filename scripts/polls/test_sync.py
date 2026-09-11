import json
from pathlib import Path
import tempfile
import unittest
from sync import parse, measure, sync

FIXTURE = '''<h2>Seat projections</h2><h3>2026</h3>
<table class="wikitable"><tr><th rowspan="2">Fieldwork date</th>
<th rowspan="2">Polling firm</th><th rowspan="2">Publisher</th>
<th rowspan="2">Sample size</th><th colspan="2">Alliance</th><th>Other party</th><th>Gov.</th></tr>
<tr><td></td><td></td><td></td><td></td></tr>
<tr><td data-sort-value="2026-09-09">9 Sep</td><td>Firm</td>
<td>Publisher<sup><a href="#ref">1</a></sup></td><td>500</td>
<td colspan="2">60</td><td>60</td><td>60</td></tr>
<tr><td data-sort-value="2026-09-08">8 Sep</td><td colspan="7">Political event</td></tr></table>
<h2>Scenario polls</h2><h3>2026</h3>
<li id="ref"><a class="external" href="https://example.org/poll">Original poll</a></li>'''

class SyncTest(unittest.TestCase):
    def test_spans_and_events(self):
        polls, review = parse(FIXTURE)
        self.assertEqual(len(polls), 1)
        self.assertEqual(len(polls[0]['results']), 2)
        self.assertEqual(polls[0]['issues'], [])
        self.assertEqual(review, [])

    def test_scenarios_excluded(self):
        with self.assertRaises(ValueError):
            parse(FIXTURE.replace('<h2>Seat projections</h2>', '<h2>Scenario polls</h2>'))

    def test_measure(self):
        self.assertIsNone(measure('—')['seats'])
        self.assertEqual(measure('(2.9%)')['seats'], 0)
        self.assertIsNone(measure('12%')['seats'])

    def test_revisions_and_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertEqual(sync(FIXTURE, root)['new_revisions'], 1)
            self.assertEqual(sync(FIXTURE, root)['new_revisions'], 0)
            changed = FIXTURE.replace('<td>500</td>', '<td>501</td>')
            self.assertEqual(sync(changed, root)['new_revisions'], 1)
            before = (root/'polls.json').read_bytes()
            with self.assertRaises(ValueError):
                sync('<html>blocked</html>', root)
            self.assertEqual(before, (root/'polls.json').read_bytes())

if __name__ == '__main__':
    unittest.main()
