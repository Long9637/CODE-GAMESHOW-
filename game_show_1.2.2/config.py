"""
Configuration settings for the Game Show application
"""

import os
import sys

# MongoDB Configuration
MONGODB_URL = os.getenv('MONGODB_URL', 'mongodb+srv://kuuhaku9637:08169896674@cluster0.w7cdftw.mongodb.net/?appName=Cluster0')
MONGODB_DATABASE = os.getenv('MONGODB_DATABASE', 'game_show_db')

# config.py
# MONGODB_URL = "mongodb://localhost:27017/" # <-- THAY ĐỔI Ở ĐÂY
# MONGODB_DATABASE = "game_show_db"
# ... các cấu hình khác

# Check if running in a bundled executable
IS_BUNDLED = getattr(sys, 'frozen', False)

# Server Configuration  
HOST = "0.0.0.0" if IS_BUNDLED else "localhost" # Use 0.0.0.0 for bundled app, localhost for dev
PUBLIC_IP = "113.161.151.124" # IP Public của server.
PORT = 8127

# Collections
COLLECTIONS = {
    'teams': 'teams',
    'judges': 'judges', 
    'questions': 'questions',
    'used_judges': 'used_judges',
    'used_questions': 'used_questions',
    'users': 'users',
    'images': 'images',
    # 1.2.1
    'used_final_questions': 'used_final_questions'
}

# GridFS Configuration
GRIDFS_BUCKET = 'images'

# Image settings - Không giới hạn kích thước, MongoDB GridFS sẽ xử lý
MAX_IMAGE_SIZE = 100 * 1024 * 1024  # 100MB - Tăng giới hạn lên cho ảnh chất lượng cao
ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff']
IMAGE_QUALITY = 95  # Chất lượng cao cho JPEG compression
MAX_DIMENSION = 3840  # 4K resolution - chỉ thu nhỏ nếu lớn hơn 4K

# Legacy file paths (for migration)
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DB_DIRECTORY = os.path.join(DIRECTORY, 'db')
IMAGES_DIRECTORY = os.path.join(DIRECTORY, 'images', 'teams')