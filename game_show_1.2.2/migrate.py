#!/usr/bin/env python3
"""
Migration script to transfer data from JSON files to MongoDB
Chạy script này để chuyển đổi dữ liệu hiện tại sang MongoDB
"""

import sys
import os
from database import db_manager
from config import DB_DIRECTORY

def main():
    print("Game Show Data Migration Tool")
    print("=" * 50)
    
    # Kiểm tra thư mục dữ liệu
    if not os.path.exists(DB_DIRECTORY):
        print(f"❌ Không tìm thấy thư mục dữ liệu: {DB_DIRECTORY}")
        sys.exit(1)
    
    # Kết nối MongoDB
    print("Dang ket noi toi MongoDB...")
    if not db_manager.connect():
        print("❌ Không thể kết nối tới MongoDB!")
        print("💡 Hãy đảm bảo MongoDB đang chạy và cấu hình connection string đúng")
        print(f"   Connection string hiện tại: {db_manager.client}")
        sys.exit(1)
    
    print("Ket noi MongoDB thanh cong!")
    
    # Xác nhận migration
    # response = input("\nWARNING: Migration se xoa tat ca du lieu hien co trong MongoDB.\nBan co chac chan muon tiep tuc? (y/N): ")
    
    # if response.lower() != 'y':
    #     print("Migration bi huy bo")
    #     db_manager.disconnect()
    #     sys.exit(0)
    
    # Thực hiện migration
    print("\nBat dau migration...")
    success = db_manager.migrate_from_json_files()
    
    if success:
        print("\nMigration hoan thanh thanh cong!")
        
        # Hiển thị thống kê
        print("\nThong ke du lieu sau migration:")
        print("-" * 30)
        
        collections_info = [
            ('teams', 'Teams'),
            ('judges', 'Judges'),
            ('questions', 'Questions'),
            ('used_judges', 'Used Judges'),
            ('used_questions', 'Used Questions'),
            ('images', 'Images')
        ]
        
        for collection_key, display_name in collections_info:
            try:
                if collection_key == 'images':
                    count = db_manager.db['images'].count_documents({})
                else:
                    from config import COLLECTIONS
                    count = db_manager.db[COLLECTIONS[collection_key]].count_documents({})
                print(f"  {display_name}: {count} items")
            except Exception as e:
                print(f"  {display_name}: Error - {e}")
        
        print(f"\nDu lieu da duoc chuyen doi thanh cong sang MongoDB!")
        print(f"Database: {db_manager.db.name}")
        
    else: 
        print("Migration that bai! Kiem tra logs de biet them chi tiet.")
        sys.exit(1)
    
    # Ngắt kết nối
    db_manager.disconnect()

if __name__ == "__main__":
    main()