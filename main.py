import os
import sys
import threading
import socket
import webview
from app import app

def get_free_port() -> int:
    """Finds a free local port dynamically."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port

def run_flask(port: int):
    # Disable development reloader to prevent duplicate threads in pywebview
    app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False)

if __name__ == "__main__":
    port = get_free_port()
    
    # Start Flask server in a background daemon thread
    flask_thread = threading.Thread(target=run_flask, args=(port,), daemon=True)
    flask_thread.start()
    
    # Launch native desktop window pointing to the Flask server (compact fixed size)
    webview.create_window(
        title="Molten Cursor Customizer",
        url=f"http://127.0.0.1:{port}",
        width=1080,
        height=720,
        resizable=False
    )
    
    # Start the native window loop (blocks until window is closed)
    webview.start()
