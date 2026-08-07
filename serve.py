#!/usr/bin/env python3
"""Tiny local preview server for the static site. Run: python3 serve.py"""
import os, sys, functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4321

os.chdir(ROOT)
Handler = functools.partial(SimpleHTTPRequestHandler, directory=ROOT)
print(f"Serving {ROOT} at http://localhost:{PORT}/", flush=True)
ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
