import os
import io
import struct
import winreg
import ctypes
import base64
import requests
import sys
from flask import Flask, request, jsonify, render_template, send_from_directory
from PIL import Image, ImageDraw
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Determine base path for Flask assets under PyInstaller's temporary MEIPASS environment
if getattr(sys, 'frozen', False):
    template_folder = os.path.join(sys._MEIPASS, 'templates')
    static_folder = os.path.join(sys._MEIPASS, 'static')
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
else:
    app = Flask(__name__, template_folder='templates', static_folder='static')

app.secret_key = os.getenv("FLASK_SECRET_KEY", "molten_cursor_key_129837")

# Save custom cursors in the user's persistent Local AppData directory
LOCAL_APP_DATA = os.getenv("LOCALAPPDATA", os.path.expanduser("~"))
CURSORS_DIR = os.path.join(LOCAL_APP_DATA, "MoltenCursor", "cursors")
if not os.path.exists(CURSORS_DIR):
    os.makedirs(CURSORS_DIR)

# Cursor names mapped to Windows Registry names
CURSOR_REGISTRY_MAP = {
    "normal": "Arrow",
    "link": "Hand",
    "text": "IBeam",
    "precision": "Crosshair",
    "busy": "Wait",
    "working": "AppStarting",
    "help": "Help",
    "unavailable": "No",
    "move": "SizeAll"
}

def validate_env():
    """Validates env variables at startup."""
    token = os.getenv("HF_TOKEN")
    if not token:
        print("[WARNING] HF_TOKEN is not set in .env. AI image generation will require entering a token in the UI.")
    else:
        print("[INFO] HF_TOKEN is configured successfully.")

# Validate on startup
validate_env()

def remove_background(img: Image.Image, chroma_color: dict, tolerance: int, mode: str) -> Image.Image:
    """
    Applies background removal to a PIL Image.
    Supports edge-based flood fill (starts at corners) and global chroma keying.
    """
    img = img.convert("RGBA")
    if not chroma_color:
        return img
        
    r = int(chroma_color.get("r", 0))
    g = int(chroma_color.get("g", 0))
    b = int(chroma_color.get("b", 0))
    
    if mode == "flood":
        # Start flood fill from the 4 corners of the image
        width, height = img.size
        corners = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]
        for xy in corners:
            ImageDraw.floodfill(img, xy, (0, 0, 0, 0), thresh=tolerance)
    else:
        # Global Chroma Key
        pixels = img.load()
        width, height = img.size
        for x in range(width):
            for y in range(height):
                pr, pg, pb, pa = pixels[x, y]
                # Calculate color distance
                dist = ((pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2) ** 0.5
                if dist <= tolerance:
                    pixels[x, y] = (pr, pg, pb, 0) # set alpha to 0
                    
    return img

def convert_png_to_cur(image_source: Image.Image | bytes, hotspot_x: int, hotspot_y: int, base_size: int = 32) -> bytes:
    """
    Converts raw PNG/JPG bytes or PIL Image to a Windows CUR byte stream containing multiple
    resolutions (32, 48, 64, 96, 128) resampled using high-quality Lanczos.
    Injects scaled hotspot coordinates into each resolution directory entry.
    """
    if isinstance(image_source, bytes):
        img = Image.open(io.BytesIO(image_source))
    else:
        img = image_source

    img = img.convert("RGBA")
    
    # Standard cursor sizes for Windows High-DPI support
    sizes = [32, 48, 64, 96, 128]
    resampled_images = []
    size_tuples = []
    
    for s in sizes:
        resampled_img = img.resize((s, s), Image.Resampling.LANCZOS)
        resampled_images.append(resampled_img)
        size_tuples.append((s, s))

    # Save to ICO bytes
    ico_buffer = io.BytesIO()
    resampled_images[-1].save(
        ico_buffer, 
        format="ICO", 
        sizes=size_tuples, 
        append_images=resampled_images[:-1]
    )
    ico_data = ico_buffer.getvalue()

    # Modify the header to transform the ICO into a CUR (Type = 2 at index 2)
    cur_data = bytearray(ico_data)
    cur_data[2] = 2 # Sets Type field (first byte of Type) to 2

    # Overwrite the Planes & BitsPerPixel fields with proportional Hotspots
    # Each Directory Entry is 16 bytes, starting at byte index 6
    for i, s in enumerate(sizes):
        hx = int(hotspot_x * s / base_size)
        hy = int(hotspot_y * s / base_size)
        
        entry_offset = 6 + i * 16
        struct.pack_into('<HH', cur_data, entry_offset + 10, hx, hy)
        
    return bytes(cur_data)

def create_ani(frames_bytes: list[bytes], jif_rate: int = 6) -> bytes:
    """
    Assembles a list of static CUR byte buffers into a RIFF ACON Windows Animated Cursor (.ani).
    Uses standard display rate (jiffies) and aligns chunks to even byte boundaries.
    """
    num_frames = len(frames_bytes)
    
    # 1. Build LIST 'fram' chunk containing 'icon' sub-chunks
    list_body = b"fram"
    for frame in frames_bytes:
        # Align frame data to even boundary
        pad = b"\x00" if len(frame) % 2 != 0 else b""
        list_body += b"icon" + struct.pack("<I", len(frame)) + frame + pad
        
    list_chunk = b"LIST" + struct.pack("<I", len(list_body)) + list_body
    
    # 2. Build anih (Header) chunk
    # cbSizeOf = 36, cFrames = num_frames, cSteps = num_frames
    # cx = 0, cy = 0, cBitCount = 0, cPlanes = 0, jifRate = jif_rate, flags = 1 (AF_ICON)
    anih_data = struct.pack("<IIIIIIIII", 36, num_frames, num_frames, 0, 0, 0, 0, jif_rate, 1)
    anih_chunk = b"anih" + struct.pack("<I", len(anih_data)) + anih_data
    
    # 3. Assemble ACON RIFF file
    riff_body = b"ACON" + anih_chunk + list_chunk
    riff_header = b"RIFF" + struct.pack("<I", len(riff_body))
    
    return riff_header + riff_body

def apply_cursor_to_system(cursor_type: str, cur_path: str):
    """
    Updates the registry and calls SystemParametersInfoW to refresh the cursor immediately.
    """
    reg_name = CURSOR_REGISTRY_MAP.get(cursor_type)
    if not reg_name:
        raise ValueError(f"Unknown cursor type: {cursor_type}")

    # Set value in HKCU\Control Panel\Cursors
    key_path = r"Control Panel\Cursors"
    key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
    try:
        winreg.SetValueEx(key, reg_name, 0, winreg.REG_SZ, cur_path)
    finally:
        winreg.CloseKey(key)

    # SPI_SETCURSORS = 0x0057
    # SPIF_UPDATEINIFILE = 0x01
    # SPIF_SENDCHANGE = 0x02
    # 0x01 | 0x02 = 0x03
    result = ctypes.windll.user32.SystemParametersInfoW(0x0057, 0, None, 3)
    if not result:
        print(f"[WARNING] SystemParametersInfoW returned 0, but registry was updated successfully.")

def restore_defaults(cursor_type: str = "all"):
    """
    Restores default cursor by clearing the registry values and reloading.
    """
    key_path = r"Control Panel\Cursors"
    key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
    try:
        if cursor_type == "all":
            for reg_name in CURSOR_REGISTRY_MAP.values():
                winreg.SetValueEx(key, reg_name, 0, winreg.REG_SZ, "")
        else:
            reg_name = CURSOR_REGISTRY_MAP.get(cursor_type)
            if reg_name:
                winreg.SetValueEx(key, reg_name, 0, winreg.REG_SZ, "")
    finally:
        winreg.CloseKey(key)

    # Reload cursors
    ctypes.windll.user32.SystemParametersInfoW(0x0057, 0, None, 3)

def get_current_system_cursors():
    """Reads from the registry to see what cursors are currently active."""
    key_path = r"Control Panel\Cursors"
    active_cursors = {}
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_READ)
        for cursor_key, reg_name in CURSOR_REGISTRY_MAP.items():
            try:
                val, _ = winreg.QueryValueEx(key, reg_name)
                active_cursors[cursor_key] = val if val else "Default"
            except FileNotFoundError:
                active_cursors[cursor_key] = "Default"
        winreg.CloseKey(key)
    except Exception as e:
        print(f"[ERROR] Failed to read cursor registry: {e}")
        for cursor_key in CURSOR_REGISTRY_MAP.keys():
            active_cursors[cursor_key] = "Default"
    return active_cursors

# --- Routes ---

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/status", methods=["GET"])
def status():
    """Returns active cursors and API configurations."""
    return jsonify({
        "cursors": get_current_system_cursors(),
        "has_hf_token": bool(os.getenv("HF_TOKEN"))
    })

@app.route("/api/config", methods=["POST"])
def save_config():
    """Saves user HF Token for the session."""
    data = request.json or {}
    token = data.get("hf_token", "").strip()
    if token:
        # Cache in environment for the current process
        os.environ["HF_TOKEN"] = token
        return jsonify({"success": True, "message": "Token updated for this session."})
    return jsonify({"success": False, "error": "Invalid token"}), 400

@app.route("/api/generate", methods=["POST"])
def generate():
    """Generates an image using Hugging Face serverless API."""
    data = request.json or {}
    prompt = data.get("prompt", "").strip()
    user_token = data.get("hf_token", "").strip()
    
    # Use token from request body first, otherwise fall back to environment variable
    token = user_token if user_token else os.environ.get("HF_TOKEN")
    
    if not token:
        return jsonify({"success": False, "error": "Hugging Face Token is required. Please set it in Settings."}), 400
        
    if not prompt:
        return jsonify({"success": False, "error": "Prompt cannot be empty"}), 400

    # Clean the prompt and frame it specifically for cursors
    enhanced_prompt = f"mouse cursor, icon of {prompt}, isolated on stark white background, vector graphics, detailed 2D game asset"
    
    # Call Hugging Face (FLUX.1-schnell)
    api_url = "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell"
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "inputs": enhanced_prompt,
        "parameters": {
            "num_inference_steps": 4
        }
    }

    try:
        response = requests.post(api_url, headers=headers, json=payload, timeout=45)
        
        # If FLUX-schnell is loading or fails, fallback to Stable Diffusion 2.1
        if response.status_code != 200:
            print(f"[INFO] FLUX failed ({response.status_code}). Attempting Stable Diffusion fallback...")
            fallback_url = "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1"
            response = requests.post(fallback_url, headers=headers, json={"inputs": enhanced_prompt}, timeout=45)
            
        if response.status_code != 200:
            error_msg = response.json().get("error", "Failed to generate image") if response.headers.get("content-type") == "application/json" else response.text
            return jsonify({"success": False, "error": f"API Error: {error_msg}"}), response.status_code

        # Encode image to base64 to send to UI
        img_base64 = base64.b64encode(response.content).decode("utf-8")
        return jsonify({
            "success": True, 
            "image": f"data:image/png;base64,{img_base64}"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/apply", methods=["POST"])
def apply():
    """Converts image to CUR/ANI, updates registry, and reloads system cursors."""
    data = request.json or {}
    image_data_url = data.get("image", "")  # Base64 data URL
    cursor_type = data.get("type", "normal")
    hotspot_x = int(data.get("x", 0))
    hotspot_y = int(data.get("y", 0))
    size = int(data.get("size", 32))
    
    # Background removal parameters
    chroma_color = data.get("chromaColor") # e.g. {"r": 255, "g": 255, "b": 255} or None
    tolerance = int(data.get("tolerance", 30))
    remove_mode = data.get("removeMode", "flood")

    if not image_data_url:
        return jsonify({"success": False, "error": "No image data provided"}), 400

    try:
        # Extract base64 bytes
        header, encoded = image_data_url.split(",", 1)
        image_bytes = base64.b64decode(encoded)

        # Detect if input is a GIF
        is_gif = "image/gif" in header

        if is_gif:
            # Parse GIF and build ANI bytes
            img = Image.open(io.BytesIO(image_bytes))
            frames = []
            try:
                while True:
                    frame_img = img.convert("RGBA")
                    # Apply transparency to each frame
                    frame_img = remove_background(frame_img, chroma_color, tolerance, remove_mode)
                    
                    frame_buffer = io.BytesIO()
                    frame_img.save(frame_buffer, format="PNG")
                    frames.append(frame_buffer.getvalue())
                    img.seek(img.tell() + 1)
            except EOFError:
                pass

            # Convert each PNG frame to multi-res CUR bytes
            cur_frames = []
            for frame_data in frames:
                cur_bytes = convert_png_to_cur(frame_data, hotspot_x, hotspot_y, size)
                cur_frames.append(cur_bytes)

            # Build ANI bytes with default rate 6 jiffies (~100ms)
            ani_bytes = create_ani(cur_frames, jif_rate=6)
            
            cur_filename = f"molten_{cursor_type}.ani"
            cur_path = os.path.join(CURSORS_DIR, cur_filename)
            with open(cur_path, "wb") as f:
                f.write(ani_bytes)
        else:
            # Convert single static image to PIL and apply background removal
            img = Image.open(io.BytesIO(image_bytes))
            img = remove_background(img, chroma_color, tolerance, remove_mode)
            
            # Convert single static image to multi-res CUR bytes
            cur_bytes = convert_png_to_cur(img, hotspot_x, hotspot_y, size)
            cur_filename = f"molten_{cursor_type}.cur"
            cur_path = os.path.join(CURSORS_DIR, cur_filename)
            with open(cur_path, "wb") as f:
                f.write(cur_bytes)

        # Apply to system registry and reload
        apply_cursor_to_system(cursor_type, cur_path)

        return jsonify({
            "success": True,
            "message": f"Successfully applied custom {cursor_type} cursor!",
            "path": cur_path,
            "cursors": get_current_system_cursors()
        })
    except Exception as e:
        print(f"[ERROR] Failed to apply cursor: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/restore", methods=["POST"])
def restore():
    """Restores default system cursors."""
    data = request.json or {}
    cursor_type = data.get("type", "all")
    try:
        restore_defaults(cursor_type)
        return jsonify({
            "success": True,
            "message": "Default cursors restored successfully!",
            "cursors": get_current_system_cursors()
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="127.0.0.1", port=port, debug=True)
