"""Exercise the real curl client against a local HTTPS server with a test CA."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import os
from pathlib import Path
import ssl
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('repair_transport',
    Path(__file__).resolve().parents[1] / 'cloudflare/public/deploy/backfill-history.py')
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)


class TransportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        cls.cert, key = root / 'cert.pem', root / 'key.pem'
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                        '-keyout', str(key), '-out', str(cls.cert), '-days', '1',
                        '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1'],
                       check=True, capture_output=True)
        cls.calls = []

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                data = self.rfile.read(int(self.headers['Content-Length']))
                cls.calls.append((self.path, dict(self.headers), data))
                if self.path == '/redirect':
                    self.send_response(302)
                    self.send_header('Location', '/unexpected-destination')
                    response = b'redirect'
                elif self.path == '/forbidden':
                    self.send_response(403)
                    self.send_header('Content-Type', 'text/html')
                    self.send_header('CF-Ray', 'test-ray')
                    self.send_header('CF-Mitigated', 'challenge')
                    response = b'<title>Example security refusal</title>'
                elif self.path == '/unauthorized':
                    self.send_response(401)
                    self.send_header('Content-Type', 'application/json')
                    # Place the secret across the output truncation boundary.
                    secret = self.headers['Authorization'].removeprefix('Bearer ')
                    response = json.dumps({'error': 'x' * 210 + secret}).encode()
                else:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    response = json.dumps({'ok': True, 'echo': json.loads(data)}).encode()
                self.send_header('Content-Length', str(len(response)))
                self.end_headers()
                self.wfile.write(response)

            def log_message(self, *args):
                pass

        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(str(cls.cert), str(key))
        cls.server.socket = context.wrap_socket(cls.server.socket, server_side=True)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'https://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.tmp.cleanup()

    def upload(self, route, body=None, token='test-credential-' + 'a' * 48):
        # Only local tests trust their temporary CA; production TLS stays unchanged.
        with patch.dict(os.environ, {'CURL_CA_BUNDLE': str(self.cert), 'NO_PROXY': '127.0.0.1'}):
            return repair.upload_json(self.base + route, body or {'days': []}, token)

    def test_real_json_upload_preserves_utf8_escaping_and_credential_is_not_in_argv(self):
        body = {'report': '中文 "报告"\n换行\\backslash', 'days': [{'liveSeconds': 1985}]}
        with patch.object(repair.subprocess, 'run', wraps=subprocess.run) as run:
            result = self.upload('/ok', body)
            args = run.call_args.args[0]
            self.assertNotIn('test-credential-', ' '.join(args))
            self.assertNotIn('--insecure', args)
            self.assertNotIn('--location', args)
            self.assertIn('--config', args)
        self.assertEqual(result['echo'], body)
        self.assertTrue(self.calls[-1][1]['User-Agent'].startswith('curl/'))
        self.assertTrue(self.calls[-1][1]['Authorization'].startswith('Bearer test-credential-'))

    def test_403_returns_trace_information_without_a_retry(self):
        before = len(self.calls)
        with self.assertRaises(repair.UploadError) as caught:
            self.upload('/forbidden')
        text = str(caught.exception)
        for expected in ['HTTP 403', 'CF-Ray: test-ray', 'CF-Mitigated: challenge', 'Example security refusal']:
            self.assertIn(expected, text)
        self.assertEqual(len(self.calls), before + 1)

    def test_redirect_does_not_forward_credential(self):
        before = len(self.calls)
        with self.assertRaises(repair.UploadError) as caught:
            self.upload('/redirect')
        self.assertIn('HTTP 302', str(caught.exception))
        self.assertEqual(len(self.calls), before + 1)

    def test_secret_redacted_before_truncation(self):
        with self.assertRaises(repair.UploadError) as caught:
            self.upload('/unauthorized')
        self.assertNotIn('test-credential', str(caught.exception))
        self.assertIn('[已隐藏]', str(caught.exception))


if __name__ == '__main__':
    unittest.main()
