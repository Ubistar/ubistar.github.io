import importlib.util
from datetime import date, datetime
from pathlib import Path
import sqlite3
import tempfile
import unittest

MODULE = Path(__file__).resolve().parents[1] / 'cloudflare/public/deploy/backfill-history.py'
spec = importlib.util.spec_from_file_location('backfill', MODULE)
backfill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backfill)


def stamp(value):
    return int(datetime.fromisoformat(value).replace(tzinfo=backfill.TZ).timestamp())


class BackfillTests(unittest.TestCase):
    def test_cross_midnight_and_overlapping_sessions(self):
        sessions = [(stamp('2026-08-10T23:00:00'), stamp('2026-08-11T02:00:00')),
                    (stamp('2026-08-11T01:00:00'), stamp('2026-08-11T03:00:00'))]
        record = backfill.rebuild_day(date(2026, 8, 11), sessions, stamp('2026-07-15T20:00:00'))
        self.assertEqual(record['liveSeconds'], 3 * 3600)
        self.assertEqual(record['sessionCount'], 2)
        self.assertEqual(record['lazySeconds'], 21 * 3600)

    def test_first_day_is_clamped_to_monitor_start(self):
        started = stamp('2026-07-15T22:00:00')
        sessions = [(started - 3600, stamp('2026-07-16T01:00:00'))]
        record = backfill.rebuild_day(date(2026, 7, 15), sessions, started)
        self.assertEqual(record['monitoredSeconds'], 7200)
        self.assertEqual(record['liveSeconds'], 7200)
        self.assertEqual(record['lazySeconds'], 0)

    def test_zero_stays_zero_and_no_false_absence_claim(self):
        record = backfill.rebuild_day(date(2026, 8, 12), [], stamp('2026-07-15T22:00:00'))
        self.assertEqual(record['liveSeconds'], 0)
        self.assertEqual(record['sessionCount'], 0)
        self.assertIsNone(record['firstLiveAt'])
        self.assertEqual(record['rating'], '历史重算')

    def test_all_dates_not_31_day_window_and_read_only_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'monitor.db'
            db = sqlite3.connect(path)
            db.executescript('CREATE TABLE monitor_state(id, monitor_started_at); CREATE TABLE live_sessions(started_at, ended_at);')
            db.execute('INSERT INTO monitor_state VALUES(1,?)', (stamp('2026-07-15T22:00:00'),))
            db.executemany('INSERT INTO live_sessions VALUES(?,?)', [
                (stamp('2026-07-16T08:33:41'), stamp('2026-07-16T12:00:00')),
                (stamp('2026-08-10T23:00:00'), stamp('2026-08-11T01:00:00')),
                (stamp('2026-09-12T09:00:00'), None)])
            db.commit(); db.close()
            original = path.read_bytes()
            days, skipped, sessions = backfill.read_history(path, stamp('2026-09-12T13:00:00'))
            self.assertEqual(len(days), 59)
            self.assertEqual(days[0]['date'], '2026-07-15')
            self.assertEqual(days[-1]['date'], '2026-09-11')
            self.assertEqual(skipped, [])
            self.assertEqual(next(d for d in days if d['date']=='2026-08-11')['liveSeconds'], 3600)
            self.assertEqual(path.read_bytes(), original)
            # A session open since yesterday must not be extended across unobserved days.
            db=sqlite3.connect(path)
            db.execute('UPDATE live_sessions SET started_at=? WHERE ended_at IS NULL', (stamp('2026-09-10T23:00:00'),))
            db.commit(); db.close()
            days, skipped, _ = backfill.read_history(path, stamp('2026-09-12T13:00:00'))
            self.assertEqual(skipped, ['2026-09-10', '2026-09-11'])

    def test_config_is_parsed_without_executing_shell(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'push.env'
            path.write_text('CLOUDFLARE_INGEST_URL=https://api.example.test\nCLOUDFLARE_INGEST_TOKEN="$(do-not-execute)"\n')
            self.assertEqual(backfill.load_config(path), ('https://api.example.test','$(do-not-execute)'))
            path.write_text('CLOUDFLARE_INGEST_URL=http://api.example.test\nCLOUDFLARE_INGEST_TOKEN=test\n')
            with self.assertRaises(ValueError): backfill.load_config(path)


if __name__ == '__main__':
    unittest.main()
