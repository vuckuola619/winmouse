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
    # Bind to 0.0.0.0 so both the webview and browser can access the app
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)

class Api:
    def __init__(self):
        self.window = None

    def set_window(self, window):
        self.window = window

    def minimize(self):
        if self.window:
            self.window.minimize()

    def toggle_maximize(self):
        if self.window:
            self.window.toggle_fullscreen()

    def close(self):
        if self.window:
            self.window.destroy()

if __name__ == "__main__":
    port = get_free_port()
    
    # Start Flask server in a background daemon thread
    flask_thread = threading.Thread(target=run_flask, args=(port,), daemon=True)
    flask_thread.start()
    
    print(f"\n  WinMouse is running!")
    print(f"  Desktop App: launching native window...")
    print(f"  Web Browser: http://localhost:{port}  (open in any browser)\n")
    
    api = Api()
    
    # Launch native desktop window pointing to the Flask server
    window = webview.create_window(
        title="WinMouse Cursor Customizer",
        url=f"http://127.0.0.1:{port}",
        width=1280,
        height=820,
        min_size=(960, 680),
        resizable=True,
        frameless=True,
        easy_drag=False,
        js_api=api
    )
    api.set_window(window)
    
    # Start the native window loop (blocks until window is closed)
    webview.start()
