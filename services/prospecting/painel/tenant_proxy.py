"""Namespace de prospecção: processo e SQLite próprios por empresa, sem compartilhar contatos."""
import atexit
import os
import re
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import urllib.error

_children = {}
_lock = threading.Lock()


def close_all():
    with _lock:
        for process, _ in _children.values():
            if process.poll() is None:
                process.terminate()
        for process, _ in _children.values():
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
        _children.clear()


atexit.register(close_all)


def endpoint(workspace, data_dir):
    with _lock:
        saved = _children.get(workspace)
        if saved and saved[0].poll() is None:
            return saved[1]
        active = sum(process.poll() is None for process, _ in _children.values())
        if active >= max(1, min(50, int(os.environ.get('PROSPECTING_MAX_WORKSPACES', '8')))):
            raise RuntimeError('Limite de espaços de prospecção ativos. Fale com o administrador da plataforma.')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        directory = os.path.join(data_dir, 'workspaces', workspace)
        os.makedirs(directory, exist_ok=True)
        env = dict(os.environ, PAINEL_PORT=str(port), PAINEL_DATA_DIR=directory,
                   SAAS_CHILD_WORKSPACE=workspace)
        process = subprocess.Popen([sys.executable, os.path.join(os.path.dirname(__file__), 'server.py'), '--sem-navegador'], env=env, stdout=subprocess.DEVNULL)
        _children[workspace] = (process, port)
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and process.poll() is None:
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=0.2):
                    return port
            except OSError:
                time.sleep(0.05)
        process.terminate()
        raise RuntimeError('Não foi possível iniciar a prospecção desta empresa.')


def dispatch(handler, data_dir):
    workspace = handler.headers.get('X-Workspace-ID')
    if not workspace:
        return False
    if os.environ.get('SAAS_CHILD_WORKSPACE') or not re.fullmatch(r'[a-f0-9]{32}', workspace):
        handler._envia(400, {'erro': 'Identificador de empresa inválido.'})
        return True
    handler.workspace_id = workspace
    port = endpoint(workspace, data_dir)
    length = int(handler.headers.get('Content-Length') or 0)
    if length < 0 or length > 50 * 1024 * 1024:
        handler._envia(400, {'erro': 'Corpo acima do limite.'})
        return True
    body = handler.rfile.read(length) if length else None
    headers = {key: handler.headers[key] for key in ('Content-Type', 'Authorization') if handler.headers.get(key)}
    request = urllib.request.Request(f'http://127.0.0.1:{port}{handler.path}', data=body, headers=headers, method=handler.command)
    try:
        response = urllib.request.urlopen(request, timeout=70)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        handler._envia(response.code, response.read(), response.headers.get('Content-Type', 'application/json'))
    return True
