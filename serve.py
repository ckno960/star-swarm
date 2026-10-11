# 개발용 서버: 코드를 고치면 휴대폰에서 새로고침만으로 반영되게 캐시를 끈다
import functools, http.server, os

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

handler = functools.partial(NoCache, directory=os.path.dirname(os.path.abspath(__file__)))
http.server.ThreadingHTTPServer(('', 8000), handler).serve_forever()
