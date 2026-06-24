import os
import io
import struct
import winreg
import ctypes
import base64
import requests
import sys
import json
import shutil
import zipfile
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

app.secret_key = os.getenv("FLASK_SECRET_KEY", "winmouse_key_129837")

# Save custom cursors in the user's persistent Local AppData directory
LOCAL_APP_DATA = os.getenv("LOCALAPPDATA", os.path.expanduser("~"))
CURSORS_DIR = os.path.join(LOCAL_APP_DATA, "WinMouse", "cursors")
if not os.path.exists(CURSORS_DIR):
    os.makedirs(CURSORS_DIR)

PACKS_DIR = os.path.join(LOCAL_APP_DATA, "WinMouse", "packs")
if not os.path.exists(PACKS_DIR):
    os.makedirs(PACKS_DIR)

# Use absolute path to static folder for bundling safety
STATIC_PACKS_DIR = os.path.join(app.static_folder, "packs")
if not os.path.exists(STATIC_PACKS_DIR):
    os.makedirs(STATIC_PACKS_DIR)

# Cursor names mapped to Windows Registry names
CURSOR_REGISTRY_MAP = {
    "normal": "Arrow",
    "help": "Help",
    "working": "AppStarting",
    "busy": "Wait",
    "precision": "Crosshair",
    "text": "IBeam",
    "handwriting": "NWPen",
    "unavailable": "No",
    "vertical": "SizeNS",
    "horizontal": "SizeWE",
    "diagonal_1": "SizeNWSE",
    "diagonal_2": "SizeNESW",
    "move": "SizeAll",
    "alternate": "UpArrow",
    "link": "Hand",
    "location": "Pin",
    "person": "Person"
}

def draw_arrow(fill_color, outline_color):
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.polygon([(0,0), (22,15), (14,17), (20,26), (17,28), (11,19), (6,22)], fill=outline_color)
    draw.polygon([(2,2), (19,13), (12,15), (18,24), (16,25), (10,17), (6,19)], fill=fill_color)
    return img

def draw_hand(fill_color, outline_color):
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rectangle([10, 22, 22, 29], fill=outline_color)
    draw.rectangle([12, 23, 20, 28], fill=fill_color)
    draw.ellipse([8, 14, 24, 24], fill=outline_color)
    draw.ellipse([9, 15, 23, 23], fill=fill_color)
    draw.rectangle([14, 2, 18, 16], fill=outline_color)
    draw.rectangle([15, 3, 17, 15], fill=fill_color)
    draw.ellipse([7, 16, 12, 21], fill=outline_color)
    draw.ellipse([8, 17, 11, 20], fill=fill_color)
    return img

def draw_crosshair(fill_color, outline_color):
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([8, 8, 24, 24], outline=outline_color, width=2)
    draw.ellipse([10, 10, 22, 22], outline=fill_color, width=2)
    draw.line([16, 2, 16, 30], fill=outline_color, width=2)
    draw.line([16, 4, 16, 28], fill=fill_color, width=2)
    draw.line([2, 16, 30, 16], fill=outline_color, width=2)
    draw.line([4, 16, 28, 16], fill=fill_color, width=2)
    return img

def draw_hourglass(fill_color, outline_color):
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.polygon([(6,4), (26,4), (16,16), (26,28), (6,28)], fill=outline_color)
    draw.polygon([(8,6), (24,6), (16,15), (24,26), (8,26)], fill=fill_color)
    draw.polygon([(11,9), (21,9), (16,14)], fill=outline_color)
    draw.polygon([(12,25), (20,25), (16,21)], fill=outline_color)
    return img

def draw_ibeam(fill_color, outline_color):
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rectangle([8, 4, 24, 7], fill=outline_color)
    draw.rectangle([13, 7, 19, 25], fill=outline_color)
    draw.rectangle([8, 25, 24, 28], fill=outline_color)
    draw.rectangle([10, 5, 22, 6], fill=fill_color)
    draw.rectangle([15, 7, 17, 24], fill=fill_color)
    draw.rectangle([10, 26, 22, 27], fill=fill_color)
    return img

import math

def generate_pulse_arrow_frames(fill_color, outline_color, frames=12):
    """Generates frames for a pulsing arrow cursor."""
    img_list = []
    base_img = draw_arrow(fill_color, outline_color)
    for i in range(frames):
        # Pulse alpha channel
        alpha_scale = 0.5 + 0.5 * math.sin(i * 2 * math.pi / frames)
        
        frame_img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        # Draw a glowing shadow
        glow_draw = ImageDraw.Draw(frame_img)
        glow_radius = 2 + 4 * alpha_scale
        glow_color = (*fill_color[:3], int(150 * alpha_scale))
        glow_draw.polygon([(0,0), (22,15), (14,17), (20,26), (17,28), (11,19), (6,22)], fill=glow_color)
        
        # Overlay original image
        frame_img.alpha_composite(base_img)
        img_list.append(frame_img)
    return img_list

def generate_spin_frames(fill_color, outline_color, frames=12):
    """Generates frames for a spinning ring cursor (busy)."""
    img_list = []
    for i in range(frames):
        frame_img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        draw = ImageDraw.Draw(frame_img)
        
        # Draw base arrow
        arrow = draw_arrow(fill_color, outline_color)
        frame_img.alpha_composite(arrow)
        
        # Draw spinning ring next to the arrow
        cx, cy = 20, 20
        radius = 6
        angle = i * 360 / frames
        start = angle
        end = angle + 270
        
        draw.arc([cx - radius, cy - radius, cx + radius, cy + radius], start, end, fill=fill_color, width=3)
        draw.arc([cx - radius - 1, cy - radius - 1, cx + radius + 1, cy + radius + 1], start, end, fill=outline_color, width=1)
        draw.arc([cx - radius + 1, cy - radius + 1, cx + radius - 1, cy + radius - 1], start, end, fill=outline_color, width=1)
        
        img_list.append(frame_img)
    return img_list

def generate_click_hand_frames(fill_color, outline_color, frames=6):
    """Generates frames for a hand cursor that clicks and releases."""
    img_list = []
    for i in range(frames):
        frame_img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        draw = ImageDraw.Draw(frame_img)
        
        # Click offset: moves down slightly in the middle of the animation
        offset_y = 2 if i in [2, 3] else 0
        
        draw.rectangle([10, 22 + offset_y, 22, 29 + offset_y], fill=outline_color)
        draw.rectangle([12, 23 + offset_y, 20, 28 + offset_y], fill=fill_color)
        draw.ellipse([8, 14 + offset_y, 24, 24 + offset_y], fill=outline_color)
        draw.ellipse([9, 15 + offset_y, 23, 23 + offset_y], fill=fill_color)
        
        # The pointing finger: shrinks slightly when clicking
        finger_top = 2 + (2 if offset_y else 0)
        draw.rectangle([14, finger_top, 18, 16 + offset_y], fill=outline_color)
        draw.rectangle([15, finger_top + 1, 17, 15 + offset_y], fill=fill_color)
        
        draw.ellipse([7, 16 + offset_y, 12, 21 + offset_y], fill=outline_color)
        draw.ellipse([8, 17 + offset_y, 11, 20 + offset_y], fill=fill_color)
        
        # Draw a little click ripple if in clicked state
        if offset_y > 0:
            draw.arc([2, 2, 26, 26], -45, 45, fill=fill_color, width=1)
            draw.arc([4, 4, 24, 24], 135, 225, fill=fill_color, width=1)
            
        img_list.append(frame_img)
    return img_list


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

BACKUP_PATH = os.path.join(LOCAL_APP_DATA, "WinMouse", "backup_scheme.json")

def validate_cur_bytes(data: bytes) -> bool:
    """Validates CUR file header and structure."""
    if len(data) < 22:  # Header (6 bytes) + at least 1 directory entry (16 bytes)
        return False
    if data[0:4] != b"\x00\x00\x02\x00":  # Reserved 0, Type 2 (CUR)
        return False
    num_images = struct.unpack('<H', data[4:6])[0]
    if num_images == 0:
        return False
    for i in range(num_images):
        entry_offset = 6 + i * 16
        if entry_offset + 16 > len(data):
            return False
        img_size = struct.unpack('<I', data[entry_offset+8:entry_offset+12])[0]
        img_offset = struct.unpack('<I', data[entry_offset+12:entry_offset+16])[0]
        if img_offset + img_size > len(data):
            return False
    return True

def validate_ani_bytes(data: bytes) -> bool:
    """Validates ANI file header and RIFF/ACON structure."""
    if len(data) < 44:  # RIFF header + anih chunk + list chunk minimums
        return False
    if data[0:4] != b"RIFF":
        return False
    riff_size = struct.unpack('<I', data[4:8])[0]
    if riff_size + 8 > len(data):
        return False
    if data[8:12] != b"ACON":
        return False
    
    anih_offset = data.find(b"anih")
    if anih_offset == -1 or anih_offset + 8 > len(data):
        return False
    anih_size = struct.unpack('<I', data[anih_offset+4:anih_offset+8])[0]
    if anih_offset + 8 + anih_size > len(data):
        return False
        
    list_offset = data.find(b"LIST")
    if list_offset == -1 or list_offset + 8 > len(data):
        return False
        
    return True

def save_backup_scheme():
    """
    Saves current system cursors to backup_scheme.json before applying custom ones.
    Only backups cursor paths that do not point to custom WinMouse/MoltenCursor paths.
    """
    current_cursors = get_current_system_cursors()
    backup_data = {}
    
    if os.path.exists(BACKUP_PATH):
        try:
            with open(BACKUP_PATH, "r") as f:
                backup_data = json.load(f)
        except Exception:
            backup_data = {}

    updated = False
    for cursor_key, val in current_cursors.items():
        is_custom = "WinMouse" in val or "MoltenCursor" in val
        if not is_custom:
            existing_backup = backup_data.get(cursor_key)
            if not existing_backup or (val not in ("", "Default") and existing_backup != val):
                backup_data[cursor_key] = val
                updated = True

    if updated or not os.path.exists(BACKUP_PATH):
        os.makedirs(os.path.dirname(BACKUP_PATH), exist_ok=True)
        try:
            with open(BACKUP_PATH, "w") as f:
                json.dump(backup_data, f, indent=4)
        except Exception as e:
            print(f"[ERROR] Failed to write backup scheme: {e}")

def apply_cursor_to_system(cursor_type: str, cur_path: str):
    """
    Updates the registry and calls SystemParametersInfoW to refresh the cursor immediately.
    """
    reg_name = CURSOR_REGISTRY_MAP.get(cursor_type)
    if not reg_name:
        raise ValueError(f"Unknown cursor type: {cursor_type}")

    # Ensure we back up the original system settings first
    save_backup_scheme()

    # Set value in HKCU\Control Panel\Cursors
    key_path = r"Control Panel\Cursors"
    key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
    try:
        winreg.SetValueEx(key, reg_name, 0, winreg.REG_SZ, cur_path)
    finally:
        winreg.CloseKey(key)

    # Force system refresh
    result = ctypes.windll.user32.SystemParametersInfoW(0x0057, 0, None, 3)
    if not result:
        print(f"[WARNING] SystemParametersInfoW returned 0, but registry was updated successfully.")

def restore_defaults(cursor_type: str = "all"):
    """
    Restores original system cursors from backup_scheme.json if available,
    otherwise clears the registry values (safe Windows default).
    """
    backup_data = {}
    if os.path.exists(BACKUP_PATH):
        try:
            with open(BACKUP_PATH, "r") as f:
                backup_data = json.load(f)
        except Exception as e:
            print(f"[WARNING] Failed to load backup scheme: {e}")

    key_path = r"Control Panel\Cursors"
    key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
    try:
        if cursor_type == "all":
            for cursor_key, reg_name in CURSOR_REGISTRY_MAP.items():
                original_val = backup_data.get(cursor_key, "")
                val_to_write = original_val if original_val != "Default" else ""
                winreg.SetValueEx(key, reg_name, 0, winreg.REG_SZ, val_to_write)
        else:
            reg_name = CURSOR_REGISTRY_MAP.get(cursor_type)
            if reg_name:
                original_val = backup_data.get(cursor_type, "")
                val_to_write = original_val if original_val != "Default" else ""
                winreg.SetValueEx(key, reg_name, 0, winreg.REG_SZ, val_to_write)
    finally:
        winreg.CloseKey(key)

    # Force system refresh
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
            
            # Validate generated animated cursor bytes
            if not validate_ani_bytes(ani_bytes):
                raise ValueError("Generated Animated Cursor (.ani) bytes are invalid structurally.")
            
            cur_filename = f"winmouse_{cursor_type}.ani"
            cur_path = os.path.join(CURSORS_DIR, cur_filename)
            with open(cur_path, "wb") as f:
                f.write(ani_bytes)
                
            # Save static preview of first frame
            try:
                first_frame = Image.open(io.BytesIO(image_bytes))
                first_frame = remove_background(first_frame.convert("RGBA"), chroma_color, tolerance, remove_mode)
                png_path = os.path.join(CURSORS_DIR, f"winmouse_{cursor_type}.png")
                first_frame.save(png_path, "PNG")
            except Exception as e:
                print(f"[WARNING] Failed to save GIF preview PNG: {e}")
        else:
            # Convert single static image to PIL and apply background removal
            img = Image.open(io.BytesIO(image_bytes))
            img = remove_background(img, chroma_color, tolerance, remove_mode)
            
            # Convert single static image to multi-res CUR bytes
            cur_bytes = convert_png_to_cur(img, hotspot_x, hotspot_y, size)
            
            # Validate generated cursor bytes
            if not validate_cur_bytes(cur_bytes):
                raise ValueError("Generated Custom Cursor (.cur) bytes are invalid structurally.")
            
            cur_filename = f"winmouse_{cursor_type}.cur"
            cur_path = os.path.join(CURSORS_DIR, cur_filename)
            with open(cur_path, "wb") as f:
                f.write(cur_bytes)
                
            # Save PNG preview
            try:
                png_path = os.path.join(CURSORS_DIR, f"winmouse_{cursor_type}.png")
                img.save(png_path, "PNG")
            except Exception as e:
                print(f"[WARNING] Failed to save preview PNG: {e}")

        # Apply to system registry and reload
        apply_cursor_to_system(cursor_type, cur_path)

        return jsonify({
            "success": True,
            "message": f"Successfully applied custom {cursor_type} cursor!",
            "path": cur_path,
            "cursors": get_current_system_cursors()
        })
    except PermissionError as e:
        print(f"[ERROR] Registry permission denied: {e}")
        return jsonify({
            "success": False, 
            "error": "Registry write permission denied. Try running as Administrator if registry writes are restricted."
        }), 403
    except ValueError as e:
        print(f"[ERROR] Validation failed: {e}")
        return jsonify({
            "success": False,
            "error": f"Validation Error: {str(e)}"
        }), 400
    except Exception as e:
        print(f"[ERROR] Failed to apply cursor: {e}")
        return jsonify({
            "success": False,
            "error": f"Application Error: {str(e)}"
        }), 500

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
    except PermissionError as e:
        print(f"[ERROR] Registry permission denied on restore: {e}")
        return jsonify({
            "success": False, 
            "error": "Registry write permission denied. Try running as Administrator if registry writes are restricted."
        }), 403
    except Exception as e:
        print(f"[ERROR] Failed to restore: {e}")
        return jsonify({"success": False, "error": f"Restore Error: {str(e)}"}), 500

# --- Packs Manager Helper Functions ---

UNDO_BACKUP_PATH = os.path.join(LOCAL_APP_DATA, "WinMouse", "last_pack_undo.json")

def save_pack_undo_backup():
    """Saves current system cursors to last_pack_undo.json before applying a pack."""
    current_cursors = get_current_system_cursors()
    os.makedirs(os.path.dirname(UNDO_BACKUP_PATH), exist_ok=True)
    try:
        with open(UNDO_BACKUP_PATH, "w") as f:
            json.dump(current_cursors, f, indent=4)
    except Exception as e:
        print(f"[ERROR] Failed to save pack undo backup: {e}")

def apply_cursor_registry_only(cursor_type: str, cur_path: str):
    """Updates the registry for a cursor type without triggering reload."""
    reg_name = CURSOR_REGISTRY_MAP.get(cursor_type)
    if not reg_name:
        return
    key_path = r"Control Panel\Cursors"
    key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
    try:
        winreg.SetValueEx(key, reg_name, 0, winreg.REG_SZ, cur_path)
    finally:
        winreg.CloseKey(key)

# --- Packs Manager Routes ---

@app.route("/api/packs", methods=["GET"])
def list_packs():
    """Returns a list of all available packs (built-in + user)."""
    packs = []
    
    # Scan built-in packs
    if os.path.exists(STATIC_PACKS_DIR):
        for name in os.listdir(STATIC_PACKS_DIR):
            p_dir = os.path.join(STATIC_PACKS_DIR, name)
            p_json = os.path.join(p_dir, "pack.json")
            if os.path.isdir(p_dir) and os.path.exists(p_json):
                try:
                    with open(p_json, "r") as f:
                        meta = json.load(f)
                    packs.append({
                        "id": name,
                        "name": meta.get("name", name),
                        "type": "builtin"
                    })
                except Exception:
                    pass
                    
    # Scan user-saved packs
    if os.path.exists(PACKS_DIR):
        for name in os.listdir(PACKS_DIR):
            p_dir = os.path.join(PACKS_DIR, name)
            p_json = os.path.join(p_dir, "pack.json")
            if os.path.isdir(p_dir) and os.path.exists(p_json):
                try:
                    with open(p_json, "r") as f:
                        meta = json.load(f)
                    packs.append({
                        "id": name,
                        "name": meta.get("name", name),
                        "type": "user"
                    })
                except Exception:
                    pass
                    
    return jsonify(packs)

@app.route("/api/packs/preview/<pack_name>/<cursor_type>", methods=["GET"])
def get_pack_preview(pack_name, cursor_type):
    """Serves the PNG thumbnail of a cursor within a pack."""
    # Check user packs first, then built-in packs
    img_path = os.path.join(PACKS_DIR, pack_name, f"{cursor_type}.png")
    if not os.path.exists(img_path):
        img_path = os.path.join(STATIC_PACKS_DIR, pack_name, f"{cursor_type}.png")
        
    if os.path.exists(img_path):
        return send_from_directory(os.path.dirname(img_path), os.path.basename(img_path))
    else:
        # Return 1x1 transparent PNG fallback
        transparent_pixel = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")
        return send_file(io.BytesIO(transparent_pixel), mimetype="image/png")

@app.route("/api/packs/save", methods=["POST"])
def save_pack():
    """Saves the current applied custom cursors as a reusable pack."""
    data = request.json or {}
    pack_name = data.get("name", "").strip()
    if not pack_name:
        return jsonify({"success": False, "error": "Pack name is required"}), 400
        
    import re
    safe_name = re.sub(r'[^a-zA-Z0-9_\-]', '', pack_name)
    if not safe_name:
        return jsonify({"success": False, "error": "Invalid pack name character. Use alphanumeric names."}), 400
        
    target_dir = os.path.join(PACKS_DIR, safe_name)
    os.makedirs(target_dir, exist_ok=True)
    
    manifest = {
        "name": pack_name,
        "cursors": {}
    }
    
    import shutil
    copied_any = False
    
    for role in CURSOR_REGISTRY_MAP.keys():
        cur_file = f"winmouse_{role}.cur"
        ani_file = f"winmouse_{role}.ani"
        png_file = f"winmouse_{role}.png"
        
        source_file = None
        ext = None
        
        if os.path.exists(os.path.join(CURSORS_DIR, ani_file)):
            source_file = ani_file
            ext = "ani"
        elif os.path.exists(os.path.join(CURSORS_DIR, cur_file)):
            source_file = cur_file
            ext = "cur"
            
        if source_file:
            shutil.copy(os.path.join(CURSORS_DIR, source_file), os.path.join(target_dir, f"{role}.{ext}"))
            manifest["cursors"][role] = f"{role}.{ext}"
            copied_any = True
            
            # Also copy PNG preview
            if os.path.exists(os.path.join(CURSORS_DIR, png_file)):
                shutil.copy(os.path.join(CURSORS_DIR, png_file), os.path.join(target_dir, f"{role}.png"))
                
    if not copied_any:
        return jsonify({"success": False, "error": "No custom cursors are currently applied. Customize some cursor roles first!"}), 400
        
    with open(os.path.join(target_dir, "pack.json"), "w") as f:
        json.dump(manifest, f, indent=4)
        
    return jsonify({"success": True, "message": f"Pack '{pack_name}' saved successfully!"})

@app.route("/api/packs/apply", methods=["POST"])
def apply_pack():
    """Applies all cursors inside a pack to the system registry."""
    data = request.json or {}
    pack_id = data.get("id", "").strip()
    pack_type = data.get("type", "builtin")
    
    if not pack_id:
        return jsonify({"success": False, "error": "Pack ID is required"}), 400
        
    if pack_type == "builtin":
        pack_dir = os.path.join(STATIC_PACKS_DIR, pack_id)
    else:
        pack_dir = os.path.join(PACKS_DIR, pack_id)
        
    pack_json = os.path.join(pack_dir, "pack.json")
    if not os.path.exists(pack_json):
        return jsonify({"success": False, "error": "Pack not found"}), 404
        
    try:
        with open(pack_json, "r") as f:
            meta = json.load(f)
            
        cursors = meta.get("cursors", {})
        
        # Save undo backup
        save_pack_undo_backup()
        
        import shutil
        for role, filename in cursors.items():
            src_path = os.path.join(pack_dir, filename)
            if os.path.exists(src_path):
                ext = os.path.splitext(filename)[1]
                dest_filename = f"winmouse_{role}{ext}"
                dest_path = os.path.join(CURSORS_DIR, dest_filename)
                
                shutil.copy(src_path, dest_path)
                
                # Copy preview PNG
                png_src = os.path.join(pack_dir, f"{role}.png")
                if os.path.exists(png_src):
                    shutil.copy(png_src, os.path.join(CURSORS_DIR, f"winmouse_{role}.png"))
                    
                # Update registry key
                apply_cursor_registry_only(role, dest_path)
                
        # Force reload cursors once
        ctypes.windll.user32.SystemParametersInfoW(0x0057, 0, None, 3)
        
        return jsonify({
            "success": True,
            "message": f"Applied pack '{meta.get('name')}' successfully!",
            "cursors": get_current_system_cursors()
        })
    except PermissionError:
        return jsonify({"success": False, "error": "Registry access denied. Please run as Administrator."}), 403
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/packs/undo", methods=["POST"])
def undo_pack():
    """Undoes the last applied pack, reverting system cursors."""
    if not os.path.exists(UNDO_BACKUP_PATH):
        return jsonify({"success": False, "error": "No pack apply history found to undo."}), 400
        
    try:
        with open(UNDO_BACKUP_PATH, "r") as f:
            backup_data = json.load(f)
            
        key_path = r"Control Panel\Cursors"
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
        try:
            for cursor_key, val in backup_data.items():
                reg_name = CURSOR_REGISTRY_MAP.get(cursor_key)
                if reg_name:
                    val_to_write = val if val != "Default" else ""
                    winreg.SetValueEx(key, reg_name, 0, winreg.REG_SZ, val_to_write)
        finally:
            winreg.CloseKey(key)
            
        # Refresh system
        ctypes.windll.user32.SystemParametersInfoW(0x0057, 0, None, 3)
        
        # Remove backup file so we can't double undo
        os.remove(UNDO_BACKUP_PATH)
        
        return jsonify({
            "success": True,
            "message": "Reverted last applied pack successfully!",
            "cursors": get_current_system_cursors()
        })
    except PermissionError:
        return jsonify({"success": False, "error": "Registry access denied. Please run as Administrator."}), 403
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/packs/export/<pack_name>", methods=["GET"])
def export_pack(pack_name):
    """Packages a cursor pack into a downloadable .winmousepack ZIP file."""
    pack_dir = os.path.join(PACKS_DIR, pack_name)
    if not os.path.exists(pack_dir):
        pack_dir = os.path.join(STATIC_PACKS_DIR, pack_name)
        
    if not os.path.exists(pack_dir):
        return "Pack not found", 404
        
    import zipfile
    memory_file = io.BytesIO()
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for root, dirs, files in os.walk(pack_dir):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, pack_dir)
                zip_file.write(file_path, arcname)
                
    memory_file.seek(0)
    from flask import send_file
    return send_file(
        memory_file,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"{pack_name}.winmousepack"
    )

@app.route("/api/packs/import", methods=["POST"])
def import_pack():
    """Imports and extracts a .winmousepack zip file."""
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "No file uploaded"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "error": "No selected file"}), 400
        
    if not file.filename.endswith('.winmousepack') and not file.filename.endswith('.zip'):
        return jsonify({"success": False, "error": "Invalid file format. Must be a .winmousepack"}), 400
        
    try:
        import zipfile
        import re
        
        pack_name = os.path.splitext(file.filename)[0]
        safe_name = re.sub(r'[^a-zA-Z0-9_\-]', '', pack_name)
        if not safe_name:
            safe_name = "imported_pack"
            
        target_dir = os.path.join(PACKS_DIR, safe_name)
        os.makedirs(target_dir, exist_ok=True)
        
        zip_data = io.BytesIO(file.read())
        with zipfile.ZipFile(zip_data, 'r') as zip_ref:
            for member in zip_ref.namelist():
                filename = os.path.basename(member)
                if not filename or member != filename:
                    continue
                if not (filename.endswith('.cur') or filename.endswith('.ani') or filename.endswith('.png') or filename == 'pack.json'):
                    continue
                    
                with open(os.path.join(target_dir, filename), "wb") as f:
                    f.write(zip_ref.read(member))
                    
        return jsonify({"success": True, "message": f"Pack '{pack_name}' imported successfully!"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/packs/delete", methods=["POST"])
def delete_pack():
    """Deletes a custom user pack."""
    data = request.json or {}
    pack_id = data.get("id", "").strip()
    if not pack_id:
        return jsonify({"success": False, "error": "Pack ID required"}), 400
        
    target_dir = os.path.join(PACKS_DIR, pack_id)
    if not os.path.exists(target_dir):
        return jsonify({"success": False, "error": "Pack not found or is a built-in pack"}), 404
        
    try:
        import shutil
        shutil.rmtree(target_dir)
        return jsonify({"success": True, "message": "Pack deleted successfully!"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

def generate_default_packs():
    """Generates built-in packs offline."""
    packs_config = {
        "NeonCyber": {
            "name": "Neon Cyber",
            "fill": (0, 240, 255, 255),       # Cyan
            "outline": (217, 70, 239, 255),   # Magenta
            "animated": False
        },
        "RetroPixel": {
            "name": "Retro Pixel",
            "fill": (255, 255, 255, 255),     # White
            "outline": (0, 0, 0, 255),         # Black
            "animated": False
        },
        "CyberPulseAnimated": {
            "name": "Cyber Pulse (Animated)",
            "fill": (57, 255, 20, 255),       # Neon Green
            "outline": (0, 0, 0, 255),         # Black
            "animated": True
        }
    }
    
    os.makedirs(STATIC_PACKS_DIR, exist_ok=True)
    
    for pack_key, conf in packs_config.items():
        pack_dir = os.path.join(STATIC_PACKS_DIR, pack_key)
        os.makedirs(pack_dir, exist_ok=True)
        
        # Save pack.json
        manifest_path = os.path.join(pack_dir, "pack.json")
        manifest = {
            "name": conf["name"],
            "cursors": {}
        }
        
        fill = conf["fill"]
        outline = conf["outline"]
        is_anim = conf.get("animated", False)
        
        # Create images for each role
        for role in CURSOR_REGISTRY_MAP.keys():
            frames = []
            hx, hy = 16, 16
            
            if role in ["normal", "working", "help", "alternate"]:
                hx, hy = 0, 0
                if is_anim and role == "normal":
                    frames = generate_pulse_arrow_frames(fill, outline)
                else:
                    frames = [draw_arrow(fill, outline)]
            elif role in ["link", "location", "person"]:
                hx, hy = 16, 2
                if is_anim and role == "link":
                    frames = generate_click_hand_frames(fill, outline)
                else:
                    frames = [draw_hand(fill, outline)]
            elif role in ["precision"]:
                hx, hy = 16, 16
                frames = [draw_crosshair(fill, outline)]
            elif role in ["busy"]:
                hx, hy = 16, 16
                if is_anim:
                    frames = generate_spin_frames(fill, outline)
                else:
                    frames = [draw_hourglass(fill, outline)]
            elif role in ["text"]:
                hx, hy = 16, 16
                frames = [draw_ibeam(fill, outline)]
            else: # Resizing and others
                hx, hy = 16, 16
                frames = [draw_crosshair(fill, outline)] # Fallback
            
            # Save cursor file (CUR or ANI)
            if len(frames) > 1:
                # It's animated
                frames_bytes = [convert_png_to_cur(f, hx, hy) for f in frames]
                cursor_bytes = create_ani(frames_bytes, jif_rate=6)
                ext = ".ani"
            else:
                # Static
                cursor_bytes = convert_png_to_cur(frames[0], hx, hy)
                ext = ".cur"
                
            cursor_filename = f"{role}{ext}"
            cursor_path = os.path.join(pack_dir, cursor_filename)
            with open(cursor_path, "wb") as f:
                f.write(cursor_bytes)
                
            # Save PNG preview (always the first frame)
            png_filename = f"{role}.png"
            png_path = os.path.join(pack_dir, png_filename)
            frames[0].save(png_path, "PNG")
            
            manifest["cursors"][role] = cursor_filename
            
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=4)

def validate_env():
    """Validates env variables at startup."""
    token = os.getenv("HF_TOKEN")
    if not token:
        print("[WARNING] HF_TOKEN is not set in .env. AI image generation will require entering a token in the UI.")
    else:
        print("[INFO] HF_TOKEN is configured successfully.")
    
    # Generate default packs offline at startup
    try:
        generate_default_packs()
        print("[INFO] Default offline packs generated successfully.")
    except Exception as e:
        print(f"[ERROR] Failed to generate default packs: {e}")

# Validate on startup
validate_env()

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="127.0.0.1", port=port, debug=True)
