# build.spec

import os
from PyInstaller.utils.hooks import collect_data_files
import ctypes.util

# Lấy đường dẫn thư mục gốc của dự án
here = SPECPATH

# --- Helper để tìm và đóng gói VC++ Redistributable DLL ---
vcruntime_dll = ctypes.util.find_library('vcruntime140.dll')
added_binaries = []
if vcruntime_dll:
    added_binaries.append((vcruntime_dll, '.'))
    print(f"INFO: Tìm thấy và sẽ đóng gói vcruntime140.dll từ: {vcruntime_dll}")
else:
    # Nếu không tìm thấy, có thể gây lỗi trên máy khác.
    print("WARNING: Không tìm thấy vcruntime140.dll. File exe có thể không chạy được trên máy khác.")

# --- Danh sách các file và thư mục cần đóng gói ---
added_files = [
    ('index.html', '.'),
    ('styles.css', '.'),
    ('script.js', '.'),
    ('config.py', '.'),
    ('database.py', '.'),
    ('db', 'db'),
    ('data', 'data'),
    ('logo', 'logo'),
    ('sounds', 'sounds'),
    ('images', 'images')
]

# --- Cấu hình chính ---
a = Analysis(
    ['server_mongodb.py'],  # File Python chính để chạy
    pathex=[here],
    binaries=added_binaries, # Thêm DLL vào đây
    datas=added_files + collect_data_files('PIL'), # Thêm file ở đây
    hiddenimports=['pymongo', 'PIL'], # Thêm các thư viện có thể bị bỏ sót
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False
)

# --- Cấu hình đóng gói ---
pyz = PYZ(a.pure, a.zipped_data, cipher=None)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas, 
    name='GameShowApp',  # Tên file .exe sẽ được tạo
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # Hiện cửa sổ dòng lệnh để xem log (hữu ích khi debug)
    icon='logo/logo.ico' # Đường dẫn đến file icon (nếu có)
)