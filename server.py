import http.server
import socketserver
import os
import json

PORT = 8080

def _load_env_keys():
    url = os.environ.get('SUPABASE_URL')
    key = os.environ.get('SUPABASE_ANON_KEY')
    # Fallback: parse .env in CWD
    try:
        env_path = os.path.join(os.getcwd(), '.env')
        if os.path.exists(env_path):
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    if '=' not in line:
                        continue
                    k, v = line.strip().split('=', 1)
                    v = v.strip().strip('"').strip("'")
                    if k == 'SUPABASE_URL' and not url:
                        url = v
                    if k == 'SUPABASE_ANON_KEY' and not key:
                        key = v
    except Exception:
        pass
    return url, key


class MyHttpRequestHandler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        if path.endswith('.js'):
            return 'application/javascript; charset=utf-8'
        if path.endswith('.html'):
            return 'text/html; charset=utf-8'
        if path.endswith('.css'):
            return 'text/css; charset=utf-8'
        return super().guess_type(path)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        return super().end_headers()

    def do_GET(self):
        if self.path == '/env.js':
            url, key = _load_env_keys()
            payload = {
                'SUPABASE_URL': url,
                'SUPABASE_ANON_KEY': key,
            }
            data = 'window.ENV = ' + json.dumps(payload, ensure_ascii=False) + ';\n'
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            self.send_header('Content-Length', str(len(data.encode('utf-8'))))
            self.end_headers()
            self.wfile.write(data.encode('utf-8'))
            return
        if self.path.startswith('/mock/scores'):
            # Simple mock leaderboard for local testing without Supabase
            from urllib.parse import urlparse, parse_qs
            qs = parse_qs(urlparse(self.path).query)
            limit = None
            try:
                if 'limit' in qs:
                    limit = int(qs['limit'][0])
            except Exception:
                limit = None
            total = 30
            rows = []
            for i in range(total):
                rows.append({
                    'nickname': f'player{i+1:02d}',
                    'score': (total - i) * 100 + (i % 13) * 7,
                    'created_at': '2025-01-01T00:00:00Z',
                })
            # Range header: "from-to"
            rng = self.headers.get('Range') or ''
            start, end = 0, total - 1
            try:
                if '-' in rng:
                    s, e = rng.split('-', 1)
                    start = int(s.strip()) if s.strip() else 0
                    end = int(e.strip()) if e.strip() else (start + 9)
            except Exception:
                start, end = 0, total - 1
            sliced = rows
            if limit is not None:
                sliced = rows[:max(0, min(limit, total))]
            else:
                start = max(0, min(start, total-1))
                end = max(start, min(end, total-1))
                sliced = rows[start:end+1]
            data = json.dumps(sliced, ensure_ascii=False)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            # Match Supabase style Content-Range for pagination
            if limit is None:
                self.send_header('Content-Range', f"{start}-{start+len(sliced)-1}/{total}")
            else:
                self.send_header('Content-Range', f"0-{len(sliced)-1}/{total}")
            self.end_headers()
            self.wfile.write(data.encode('utf-8'))
            return
        return super().do_GET()

with socketserver.TCPServer(("127.0.0.1", PORT), MyHttpRequestHandler) as httpd:
    print("Serving at port", PORT)
    httpd.serve_forever()
