import io
import struct
import unittest
from unittest.mock import patch, MagicMock
from PIL import Image

import app
from app import (
    convert_png_to_cur, 
    create_ani, 
    validate_cur_bytes, 
    validate_ani_bytes
)

class TestCursorCreation(unittest.TestCase):
    def setUp(self):
        # Create a simple 128x128 RGBA test image in memory
        self.img = Image.new("RGBA", (128, 128), color=(0, 120, 255, 255))
        self.img_bytes = io.BytesIO()
        self.img.save(self.img_bytes, format="PNG")
        self.img_bytes = self.img_bytes.getvalue()

    def test_cur_header_type(self):
        # Convert to CUR with a hotspot of (8, 16)
        cur_bytes = convert_png_to_cur(self.img_bytes, hotspot_x=8, hotspot_y=16, base_size=32)

        # A valid CUR header starts with:
        # Reserved: 0x00 0x00 (2 bytes)
        # Type: 0x02 0x00 (2 bytes for CUR)
        # Count: 0x05 0x00 (2 bytes for 5 sizes: 32, 48, 64, 96, 128)
        self.assertEqual(cur_bytes[0:2], b"\x00\x00")
        self.assertEqual(cur_bytes[2:4], b"\x02\x00")
        self.assertEqual(cur_bytes[4:6], b"\x05\x00")

    def test_multi_resolution_hotspots(self):
        # Convert to CUR with base hotspot (10, 20) at base size 32
        base_x = 10
        base_y = 20
        cur_bytes = convert_png_to_cur(self.img_bytes, hotspot_x=base_x, hotspot_y=base_y, base_size=32)

        # Target sizes in convert_png_to_cur: [32, 48, 64, 96, 128]
        sizes = [32, 48, 64, 96, 128]

        for i, s in enumerate(sizes):
            # Calculate expected proportional hotspot
            expected_x = int(base_x * s / 32)
            expected_y = int(base_y * s / 32)
            
            # Directory entry offset: 6 + i * 16
            entry_offset = 6 + i * 16
            
            # Unpack Hotspot X & Y (little-endian unsigned short at entry_offset + 10 and + 12)
            x_val = struct.unpack_from('<H', cur_bytes, entry_offset + 10)[0]
            y_val = struct.unpack_from('<H', cur_bytes, entry_offset + 12)[0]
            
            self.assertEqual(x_val, expected_x, f"Hotspot X mismatch for size {s}")
            self.assertEqual(y_val, expected_y, f"Hotspot Y mismatch for size {s}")

    def test_ani_file_assembly(self):
        # Build 3 fake static CUR frame buffers
        frame1 = b"\x00\x00\x02\x00\x01\x00" + b"\x20" * 16 + b"IMAGEDATA1"
        frame2 = b"\x00\x00\x02\x00\x01\x00" + b"\x20" * 16 + b"IMAGEDATA22" # Odd length (11 bytes) to trigger pad
        frame3 = b"\x00\x00\x02\x00\x01\x00" + b"\x20" * 16 + b"IMAGEDATA3"
        
        frames = [frame1, frame2, frame3]
        
        # Compile into ANI with default rate of 6 jiffies
        ani_bytes = create_ani(frames, jif_rate=6)
        
        # Verify RIFF structure
        self.assertEqual(ani_bytes[0:4], b"RIFF")
        
        # Verify ACON format tag
        self.assertEqual(ani_bytes[8:12], b"ACON")
        
        # Verify anih chunk identifier
        self.assertTrue(b"anih" in ani_bytes)
        
        # Verify frames count in anih header (offset of anih data depends on structure, but can be located)
        anih_index = ani_bytes.find(b"anih")
        anih_size = struct.unpack_from('<I', ani_bytes, anih_index + 4)[0]
        self.assertEqual(anih_size, 36)
        
        # Unpack cFrames (offset anih_index + 8 + 4)
        c_frames = struct.unpack_from('<I', ani_bytes, anih_index + 8 + 4)[0]
        c_steps = struct.unpack_from('<I', ani_bytes, anih_index + 8 + 8)[0]
        self.assertEqual(c_frames, 3)
        self.assertEqual(c_steps, 3)

class TestValidationAndBackupRestore(unittest.TestCase):
    def setUp(self):
        # Create a simple 128x128 RGBA test image in memory
        self.img = Image.new("RGBA", (128, 128), color=(255, 0, 0, 255))
        self.img_bytes = io.BytesIO()
        self.img.save(self.img_bytes, format="PNG")
        self.img_bytes = self.img_bytes.getvalue()

    def test_validate_cur_good(self):
        cur_bytes = convert_png_to_cur(self.img_bytes, hotspot_x=0, hotspot_y=0)
        self.assertTrue(validate_cur_bytes(cur_bytes))

    def test_validate_cur_bad(self):
        # Invalid prefix
        self.assertFalse(validate_cur_bytes(b"invalid header bytes here"))
        # Header correct but truncated directories
        bad_header = b"\x00\x00\x02\x00\x02\x00" + b"\x00" * 10
        self.assertFalse(validate_cur_bytes(bad_header))

    def test_validate_ani_good(self):
        cur_bytes = convert_png_to_cur(self.img_bytes, hotspot_x=0, hotspot_y=0)
        ani_bytes = create_ani([cur_bytes], jif_rate=6)
        self.assertTrue(validate_ani_bytes(ani_bytes))

    def test_validate_ani_bad(self):
        self.assertFalse(validate_ani_bytes(b"not a riff file"))
        # Invalid format tag
        self.assertFalse(validate_ani_bytes(b"RIFF\x00\x00\x00\x00NOTACON"))

    @patch('app.get_current_system_cursors')
    @patch('app.os.path.exists')
    @patch('builtins.open', new_callable=unittest.mock.mock_open)
    @patch('app.json.dump')
    def test_save_backup_scheme_creates_json(self, mock_json_dump, mock_open, mock_exists, mock_get_cursors):
        mock_exists.return_value = False
        mock_get_cursors.return_value = {
            "normal": "C:\\Windows\\Cursors\\aero_arrow.cur",
            "link": "Default"
        }
        
        from app import save_backup_scheme
        save_backup_scheme()
        
        mock_open.assert_called_with(app.BACKUP_PATH, 'w')
        mock_json_dump.assert_called_once()
        written_data = mock_json_dump.call_args[0][0]
        self.assertEqual(written_data["normal"], "C:\\Windows\\Cursors\\aero_arrow.cur")
        self.assertEqual(written_data["link"], "Default")

    @patch('app.get_current_system_cursors')
    @patch('app.os.path.exists')
    @patch('builtins.open', new_callable=unittest.mock.mock_open, read_data='{"normal": "C:\\\\Windows\\\\Cursors\\\\aero_arrow.cur", "link": "Default"}')
    @patch('app.winreg')
    @patch('app.ctypes.windll.user32.SystemParametersInfoW')
    def test_restore_defaults_restores_from_json(self, mock_spi, mock_winreg, mock_open, mock_exists, mock_get_cursors):
        mock_exists.return_value = True
        
        from app import restore_defaults
        restore_defaults("normal")
        
        # Verify it set registry to the backed up value
        mock_winreg.SetValueEx.assert_called_with(mock_winreg.OpenKey.return_value, "Arrow", 0, mock_winreg.REG_SZ, "C:\\Windows\\Cursors\\aero_arrow.cur")
        mock_winreg.CloseKey.assert_called_once()
        mock_spi.assert_called_once()

class TestPacksManager(unittest.TestCase):
    def setUp(self):
        self.app = app.app.test_client()
        self.app.testing = True

    @patch('app.os.path.exists')
    @patch('app.os.path.isdir')
    @patch('app.os.makedirs')
    @patch('app.os.listdir')
    @patch('builtins.open', new_callable=unittest.mock.mock_open, read_data='{"name": "Neon Cyber", "cursors": {"normal": "normal.cur"}}')
    def test_list_packs(self, mock_open, mock_listdir, mock_makedirs, mock_isdir, mock_exists):
        # Scan static and user pack directories
        mock_exists.return_value = True
        mock_isdir.return_value = True
        mock_listdir.side_effect = [["NeonCyber"], ["UserPack"]]
        
        response = self.app.get('/api/packs')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["id"], "NeonCyber")
        self.assertEqual(data[0]["type"], "builtin")
        self.assertEqual(data[1]["id"], "UserPack")
        self.assertEqual(data[1]["type"], "user")

    @patch('app.os.path.exists')
    @patch('app.os.makedirs')
    @patch('app.shutil.copy')
    @patch('builtins.open', new_callable=unittest.mock.mock_open)
    @patch('app.json.dump')
    def test_save_pack(self, mock_json_dump, mock_open, mock_copy, mock_makedirs, mock_exists):
        # We need to simulate applied custom cursors
        # For 'normal' cursor, let's say static cur exists
        def exists_side_effect(path):
            if "winmouse_normal.cur" in path:
                return True
            return False
        mock_exists.side_effect = exists_side_effect
        
        response = self.app.post('/api/packs/save', json={"name": "MyCustomPack"})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        
        # Verify it copied normal cursor and saved pack.json
        mock_copy.assert_any_call(
            app.os.path.join(app.CURSORS_DIR, "winmouse_normal.cur"),
            app.os.path.join(app.PACKS_DIR, "MyCustomPack", "normal.cur")
        )
        mock_json_dump.assert_called_once()
        written_manifest = mock_json_dump.call_args[0][0]
        self.assertEqual(written_manifest["name"], "MyCustomPack")
        self.assertEqual(written_manifest["cursors"]["normal"], "normal.cur")

    @patch('app.os.path.exists')
    @patch('app.os.makedirs')
    @patch('app.shutil.copy')
    @patch('builtins.open', new_callable=unittest.mock.mock_open, read_data='{"name": "Neon Cyber", "cursors": {"normal": "normal.cur"}}')
    @patch('app.winreg')
    @patch('app.ctypes.windll.user32.SystemParametersInfoW')
    @patch('app.get_current_system_cursors')
    def test_apply_pack(self, mock_get_cursors, mock_spi, mock_winreg, mock_open, mock_copy, mock_makedirs, mock_exists):
        # Mock paths
        mock_exists.return_value = True
        mock_get_cursors.return_value = {}
        
        response = self.app.post('/api/packs/apply', json={"id": "NeonCyber", "type": "builtin"})
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        
        # Check that it copied files to the cursors folder
        mock_copy.assert_any_call(
            app.os.path.join(app.STATIC_PACKS_DIR, "NeonCyber", "normal.cur"),
            app.os.path.join(app.CURSORS_DIR, "winmouse_normal.cur")
        )
        # Check that registry value was written
        mock_winreg.SetValueEx.assert_called_with(
            mock_winreg.OpenKey.return_value, 
            "Arrow", 0, mock_winreg.REG_SZ, 
            app.os.path.join(app.CURSORS_DIR, "winmouse_normal.cur")
        )
        # Check SPI reload was triggered once
        mock_spi.assert_called_once()

    @patch('app.os.path.exists')
    @patch('builtins.open', new_callable=unittest.mock.mock_open, read_data='{"normal": "C:\\\\Windows\\\\Cursors\\\\aero_arrow.cur"}')
    @patch('app.winreg')
    @patch('app.ctypes.windll.user32.SystemParametersInfoW')
    @patch('app.os.remove')
    def test_undo_pack(self, mock_remove, mock_spi, mock_winreg, mock_open, mock_exists):
        mock_exists.return_value = True
        
        response = self.app.post('/api/packs/undo')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["success"])
        
        # Verify it restored the registry value from backup
        mock_winreg.SetValueEx.assert_called_with(
            mock_winreg.OpenKey.return_value, 
            "Arrow", 0, mock_winreg.REG_SZ, 
            "C:\\Windows\\Cursors\\aero_arrow.cur"
        )
        mock_spi.assert_called_once()
        mock_remove.assert_called_with(app.UNDO_BACKUP_PATH)

if __name__ == "__main__":
    unittest.main()
