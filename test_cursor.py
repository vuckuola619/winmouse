import io
import struct
import unittest
from PIL import Image
from app import convert_png_to_cur, create_ani

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

if __name__ == "__main__":
    unittest.main()
