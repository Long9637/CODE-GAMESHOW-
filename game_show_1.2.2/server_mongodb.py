#!/usr/bin/env python3
"""
Game Show Server with MongoDB backend and GridFS for high-quality images
Chạy trên IP: 113.161.151.124:8126
"""

import http.server
import socketserver
import os
import sys
import json
import urllib.parse
import base64
import uuid
import re
from pathlib import Path
import logging

# === PYINSTALLER HELPER ===
# Xác định đường dẫn gốc của ứng dụng, hoạt động cho cả môi trường dev và file .exe
if getattr(sys, 'frozen', False):
    # Nếu chạy từ file .exe (đã đóng gói), application_path là thư mục tạm _MEIPASS
    application_path = sys._MEIPASS
else:
    # Nếu chạy file .py bình thường, application_path là thư mục chứa file script
    application_path = os.path.dirname(os.path.abspath(__file__))
# ==========================

# Import MongoDB components
from database import db_manager
from config import HOST, PORT, COLLECTIONS , PUBLIC_IP

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=application_path, **kwargs)
    
    def end_headers(self):
        # Add CORS headers for API calls
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

        # === FIX: Chống cache phía server và trình duyệt ===
        # Ra lệnh không lưu cache cho tất cả các yêu cầu để đảm bảo dữ liệu luôn mới nhất
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()
    
    def do_GET(self):
        # Handle API requests
        if self.path.startswith('/api/'):
            self.handle_api_request()
        elif self.path.startswith('/images/'):
            # Serve images (both legacy files and MongoDB images)
            self.serve_image()
        else:
            # Serve static files
            super().do_GET()
    
    def serve_image(self):
        """Serve images - both from filesystem and MongoDB GridFS"""
        try:
            # Parse the image path
            parsed_path = urllib.parse.urlparse(self.path)
            path_parts = parsed_path.path.split('/')
            
            # Check if it's a MongoDB image request: /api/image/{image_id}
            if len(path_parts) >= 4 and path_parts[1] == 'api' and path_parts[2] == 'image':
                image_id = path_parts[3]
                self.serve_mongodb_image(image_id)
                return
            
            # Legacy image serving from filesystem
            image_path = urllib.parse.unquote(self.path[1:])  # Remove leading /
            full_path = os.path.join(application_path, image_path)
            
            if not os.path.exists(full_path):
                self.send_error(404, "Image not found")
                return
            
            # Get file extension for MIME type
            ext = os.path.splitext(full_path)[1].lower()
            mime_types = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg', 
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.svg': 'image/svg+xml'
            }
            
            content_type = mime_types.get(ext, 'application/octet-stream')
            
            # Read and serve the image
            with open(full_path, 'rb') as f:
                image_data = f.read()
            
            self.send_response(200)
            self.send_header('Content-type', content_type)
            self.send_header('Content-length', len(image_data))
            self.send_header('Cache-Control', 'public, max-age=3600')  # Cache for 1 hour
            self.end_headers()
            self.wfile.write(image_data)
            
        except Exception as e:
            logger.error(f"Error serving image: {e}")
            self.send_error(500, f"Error serving image: {str(e)}")
    
    def serve_mongodb_image(self, image_id):
        """Serve image from MongoDB GridFS"""
        try:
            logger.info(f"🖼️  Serving image {image_id} from MongoDB")
            if not db_manager.is_connected():
                logger.error("❌ Database not available")
                self.send_error(503, "Database not available")
                return

            image_info = db_manager.get_team_image(image_id)
            
            if not image_info:
                logger.warning(f"⚠️  Image {image_id} not found in MongoDB")
                self.send_error(404, "Image not found")
                return

            logger.info(f"✅ Image {image_id} found:")
            logger.info(f"   - Content-Type: {image_info['content_type']}")
            logger.info(f"   - Data size: {len(image_info['data'])} bytes")
            logger.info(f"   - Dimensions: {image_info['dimensions']['width']}x{image_info['dimensions']['height']}")
            
            self.send_response(200)
            self.send_header('Content-type', image_info['content_type'])
            self.send_header('Content-length', len(image_info['data']))
            self.send_header('Cache-Control', 'public, max-age=86400')  # Cache for 24 hours
            self.send_header('X-Image-Dimensions', f"{image_info['dimensions']['width']}x{image_info['dimensions']['height']}")
            self.end_headers()
            self.wfile.write(image_info['data'])
            logger.info(f"📤 Image {image_id} sent successfully ({len(image_info['data'])} bytes)")
            
        except Exception as e:
            logger.error(f"❌ Error serving MongoDB image {image_id}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            self.send_error(500, f"Error serving image: {str(e)}")

    def do_POST(self):
        if self.path.startswith('/api/'):
            self.handle_api_request()
        else:
            self.send_error(404)
    
    def do_DELETE(self):
        if self.path.startswith('/api/'):
            self.handle_api_request()
        else:
            self.send_error(404)
    
    def handle_delete_team_post(self):
        """Xử lý yêu cầu xóa team qua phương thức POST"""
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            team_id = data.get('team_id')
            if not team_id:
                self.send_error(400, "Bad Request: Missing team_id")
                return

            success = db_manager.delete_team(team_id)
            if success:
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True}).encode('utf-8'))
            else:
                self.send_error(404, "Team not found or failed to delete")
        except Exception as e:
            logger.error(f"Error handling delete team request: {e}")
            self.send_error(500, f"Server error: {str(e)}")

    
    def handle_api_request(self):
        try:
            # Check database connection
            if not db_manager.is_connected():
                self.send_error(503, "Database not available")
                return
            
            parsed_path = urllib.parse.urlparse(self.path)
            path_parts = parsed_path.path.split('/')
            
            if len(path_parts) >= 3 and path_parts[1] == 'api':
                resource = path_parts[2]
                
                # Logic để xử lý yêu cầu DELETE /api/data/teams/{team_id}
                if (resource == 'data' and self.command == 'POST' and
                    len(path_parts) >= 5 and path_parts[3] == 'teams' and path_parts[4] == 'delete'):
                    self.handle_delete_team_post() # Gọi hàm xử lý mới
                elif resource == 'data' and len(path_parts) >= 4:
                    filename = path_parts[3]
                    self.handle_data_request(filename)
                elif resource == 'upload-image' and self.command == 'POST':
                    self.handle_image_upload()
                elif resource == 'image' and len(path_parts) >= 4 and self.command == 'GET':
                    image_id = path_parts[3]
                    self.serve_mongodb_image(image_id)
                elif resource == 'clear-all' and self.command == 'DELETE':
                    self.handle_clear_all()
                elif resource == 'health' and self.command == 'GET':
                    self.handle_health_check()
                elif resource == 'welcome' and self.command == 'GET':
                    self.handle_welcome()
                else:
                    self.send_error(404, "API endpoint not found")
            else:
                self.send_error(404, "Invalid API path")
                
        except Exception as e:
            logger.error(f"API request error: {e}")
            self.send_error(500, f"Server error: {str(e)}")
    
    def handle_health_check(self):
        """Health check endpoint"""
        try:
            db_status = "connected" if db_manager.is_connected() else "disconnected"

            health_info = {
                "status": "ok",
                "database": db_status,
                "timestamp": db_manager.db.command("serverStatus")["localTime"].isoformat() if db_manager.is_connected() else None
            }

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(health_info).encode('utf-8'))

        except Exception as e:
            self.send_error(500, f"Health check failed: {str(e)}")

    def handle_welcome(self):
        """Welcome endpoint with logging"""
        try:
            # Log request metadata
            logger.info(f"Request received: {self.command} {self.path} from {self.client_address[0]}")

            welcome_message = {
                "message": "Welcome to the Game Show API Service!",
                "status": "success",
                "timestamp": db_manager.db.command("serverStatus")["localTime"].isoformat() if db_manager.is_connected() else None
            }

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(welcome_message, ensure_ascii=False).encode('utf-8'))

        except Exception as e:
            logger.error(f"Error handling welcome request: {e}")
            self.send_error(500, f"Server error: {str(e)}")
    
    def handle_data_request(self, filename):
        """Handle data operations with MongoDB, with correct priority for special cases"""

        if self.command == 'GET':
            try:
                if filename == 'teams':
                    data = db_manager.get_teams()
                elif filename == 'login':
                    login_doc = db_manager.db['users'].find_one({'type': 'login_status'})
                    data = {"logged_in": login_doc['logged_in'] if login_doc else False}
                else:
                    collection_mapping = {
                        'judges': 'judges',
                        'questions': 'questions',
                        'used_judges': 'used_judges',
                        'used_questions': 'used_questions',
                        #1.2.1
                        'used_final_questions': 'used_final_questions'
                    }
                    if filename in collection_mapping:
                        collection_name = COLLECTIONS[collection_mapping[filename]]
                        data = db_manager.get_data(collection_name)
                    else:
                        logger.warning(f"Unknown data type for GET: {filename}")
                        self.send_error(404, "Data type not found")
                        return
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
                
            except Exception as e:
                logger.error(f"Error reading {filename}: {e}")
                self.send_error(500, f"Error reading {filename}: {str(e)}")
        
        elif self.command == 'POST':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                
                success = False
                
                if filename == 'teams':
                    # === FIX: Gọi lại hàm save_teams đã được khôi phục ===
                    if isinstance(data, list):
                        success = db_manager.save_teams(data)
                    else:
                        logger.error("Invalid data format for teams, expected a list.")
                elif filename == 'login':
                    from datetime import datetime
                    db_manager.db['users'].update_one(
                        {'type': 'login_status'},
                        {'$set': {'logged_in': data.get('logged_in', False), 'updated_at': datetime.utcnow()}},
                        upsert=True
                    )
                    success = True
                else:
                    collection_mapping = {
                        'judges': 'judges',
                        'questions': 'questions',
                        'used_judges': 'used_judges',
                        'used_questions': 'used_questions',
                        # 1.2.1
                        'used_final_questions': 'used_final_questions'
                    }
                    if filename in collection_mapping:
                        collection_name = COLLECTIONS[collection_mapping[filename]]
                        success = db_manager.save_data(collection_name, data)
                    else:
                        logger.warning(f"Unknown data type for POST: {filename}")
                        self.send_error(404, "Data type not found")
                        return

                if success:
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True}).encode('utf-8'))
                else:
                    self.send_error(500, f"Failed to save {filename}")
                    
            except Exception as e:
                logger.error(f"Error writing {filename}: {e}")
                self.send_error(500, f"Error writing {filename}: {str(e)}")
    
    def handle_clear_all(self):
        """Clear all data from MongoDB"""
        try:
            success = db_manager.clear_all_data()
            
            if success:
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True, 
                    "message": "Đã xóa tất cả dữ liệu từ MongoDB!"
                }).encode('utf-8'))
            else:
                self.send_error(500, "Failed to clear data")
            
        except Exception as e:
            logger.error(f"Error clearing data: {e}")
            self.send_error(500, f"Error clearing data: {str(e)}")
    
    def handle_image_upload(self):
        """Handle image upload with MongoDB GridFS"""
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            # Log request size for debugging
            logger.info(f"Received image upload request: {content_length} bytes")
            
            try:
                # Try to decode with strict=False to handle control characters
                decoded_data = post_data.decode('utf-8', errors='replace')
                
                # Clean any potential control characters that might cause JSON parsing issues
                import re
                cleaned_data = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', decoded_data)
                
                data = json.loads(cleaned_data)
                
            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error at position {e.pos}: {str(e)}")
                # Try alternative approach - parse in chunks
                try:
                    # Alternative: try parsing the raw bytes differently
                    decoded_text = post_data.decode('utf-8', errors='ignore')
                    data = json.loads(decoded_text)
                except Exception as e2:
                    logger.error(f"Secondary parsing also failed: {str(e2)}")
                    raise ValueError(f"Cannot parse JSON data. Original error: {str(e)}")
            
            # Extract image data and metadata
            image_data = data.get('imageData', '')
            team_name = data.get('teamName', '')
            team_id = data.get('teamId', '')
            
            logger.info(f"Processing image for team: {team_name}")
            logger.info(f"Image data size: {len(image_data)} characters")
            
            if not image_data or not image_data.startswith('data:image/'):
                raise ValueError("Invalid image data format")
            
            # Save image using MongoDB GridFS
            result = db_manager.save_team_image(image_data, team_name, team_id)
            
            if result:
                logger.info(f"Image upload successful for team: {team_name}")
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True,
                    "image_id": result['image_id'],
                    "imagePath": f"/api/image/{result['image_id']}",
                    "original_size": result['original_size'],
                    "optimized_size": result['optimized_size'],
                    "dimensions": result['dimensions']
                }).encode('utf-8'))
            else:
                logger.error(f"❌ Failed to save image for team: {team_name}")
                self.send_error(500, "Failed to save image to MongoDB")
            
        except ValueError as e:
            logger.error(f"❌ Validation error: {e}")
            self.send_error(400, f"Invalid request: {str(e)}")
        except Exception as e:
            logger.error(f"❌ Unexpected error uploading image: {e}")
            self.send_error(500, f"Server error: {str(e)}")

def main():
    try:
        print("\n" + "="*50)
        print("🚀 GAME SHOW HỘI THI DUYÊN DÁNG XƯA VÀ NAY")
        print("="*50)
        
        # Kết nối MongoDB
        print("🔌 Đang kết nối tới MongoDB Atlas...")
        if not db_manager.connect():
            print("\n❌ LỖI: Không thể kết nối tới MongoDB!")
            print("   - Hãy đảm bảo máy tính có kết nối internet.")
            print("   - Kiểm tra lại chuỗi kết nối trong file `config.py`.")
            print("   - Đảm bảo IP của bạn đã được cho phép (whitelist) trên MongoDB Atlas.")
            sys.exit(1)
        
        print(f"✅ Kết nối thành công tới database")
        
        with socketserver.TCPServer((HOST, PORT), CustomHTTPRequestHandler) as httpd:
            local_url = f"http://{'localhost' if HOST == '0.0.0.0' else HOST}:{PORT}"

            print("\n" + "-"*50)
            print("🎉 SERVER ĐÃ SẴN SÀNG! 🎉")
            print(f"   - 🏠 Truy cập tại máy này: {local_url}")
            print(f"   - 🌍 Truy cập từ máy khác: http://{PUBLIC_IP}:{PORT}")
            print(f"   - 📁 Thư mục gốc: {application_path}")
            print(f"\n💡 Nhấn Ctrl+C để dừng server.")
            print("-" * 50 + "\n")
            httpd.serve_forever()
            
    except PermissionError:
        print(f"Loi: Khong co quyen bind vao {HOST}:{PORT}")
        print("Thu chay voi quyen Administrator hoac su dung IP khac")
        sys.exit(1)
    except OSError as e:
        print(f"Loi: {e}")
        print("Kiem tra IP va port co duoc su dung boi ung dung khac khong")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n👋 Đang dừng server...")
        db_manager.disconnect()
        print("✅ Server đã dừng!")

if __name__ == "__main__":
    main()