#!/usr/bin/env python3
"""
Backup script để sao lưu dữ liệu JSON cũ trước khi migrate sang MongoDB
"""

import os
import json
import shutil
from datetime import datetime
from config import DB_DIRECTORY, DIRECTORY

def backup_json_data():
    """Backup tất cả file JSON hiện tại"""
    
    # Tạo thư mục backup với timestamp # Tác dụng ngăn việc ghi đè backup cũ  LONG
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = os.path.join(DIRECTORY, f"backup_{timestamp}")
    # Tạo thư mục backup
    try:
        os.makedirs(backup_dir, exist_ok=True) # Không lỗi nếu thư mục đã tồn tại
        print(f"📁 Tạo thư mục backup: {backup_dir}")
        
        # Backup thư mục db
        if os.path.exists(DB_DIRECTORY):                   # Kiểm tra nếu thư mục db tồn tại
            backup_db_dir = os.path.join(backup_dir, 'db') # Tạo đường dẫn backup cho db bên trong backup_dir         LONG
            shutil.copytree(DB_DIRECTORY, backup_db_dir)   # Sao chép toàn bộ cây thư mục DB_DIRECTORY vào backup_db_dir bằng shutil.copytree.
            print(f"✅ Đã backup thư mục db")
        
        # Backup thư mục images
        images_dir = os.path.join(DIRECTORY, 'images')   # Tạo đường dẫn đến thư mục images bên trong DIRECTORY
        if os.path.exists(images_dir):           # Kiểm tra nếu thư mục images tồn tại
            backup_images_dir = os.path.join(backup_dir, 'images') # Tạo đường dẫn backup cho images bên trong backup_dir
            shutil.copytree(images_dir, backup_images_dir)  # Sao chép toàn bộ cây thư mục images_dir vào backup_images_dir bằng shutil.copytree.
            print(f"✅ Đã backup thư mục images")
        
        # Tạo file README trong backup
        readme_content = f"""# Game Show Data Backup
        
Backup được tạo lúc: {datetime.now().isoformat()}
Thư mục gốc: {DIRECTORY}

## Nội dung backup:
- db/: Tất cả file JSON cũ
- images/: Tất cả ảnh trong hệ thống cũ

## Khôi phục:
Để khôi phục dữ liệu, copy nội dung từ thư mục này về thư mục gốc.
"""
        
        with open(os.path.join(backup_dir, 'README.md'), 'w', encoding='utf-8') as f:
            f.write(readme_content)
        
        print(f"🎉 Backup hoàn thành: {backup_dir}")
        return backup_dir
        
    except Exception as e:
        print(f"❌ Lỗi khi backup: {e}")
        return None

def main():
    print("💾 Game Show Data Backup Tool")
    print("=" * 40)
    
    backup_path = backup_json_data()
    
    if backup_path:
        print(f"\n✅ Backup thành công!")
        print(f"📂 Đường dẫn: {backup_path}")
        print(f"\n💡 Bạn có thể chạy migration an toàn bây giờ.")
        print(f"   Chạy: python migrate.py")
    else:
        print(f"\n❌ Backup thất bại!")

if __name__ == "__main__":
    main()