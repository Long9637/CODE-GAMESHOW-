#!/usr/bin/env python3
"""
Game Show Server with JSON API endpoints
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
from pathlib import Path
import datetime

# Configuration
HOST = "0.0.0.0"  # Bind to all interfaces (cho phép truy cập từ ngoài)
# PUBLIC_IP = "113.161.151.124"  # IP public (đã port forward). Bỏ ghi chú khi deploy.
PUBLIC_IP = "localhost" # Sử dụng "localhost" để test trên máy local.
PORT = 8126  # Tạm đổi port
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DB_DIRECTORY = os.path.join(DIRECTORY, 'db')
IMAGES_DIRECTORY = os.path.join(DIRECTORY, 'images', 'teams')

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        # Add CORS headers for API calls
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()
    
    def do_GET(self):
        # Handle API requests
        if self.path.startswith('/api/'):
            self.handle_api_request()
        elif self.path.startswith('/images/'):
            # Serve images with proper MIME types
            self.serve_image()
        else:
            # Serve static files
            super().do_GET()
    
    def serve_image(self):
        """Serve images from images directory"""
        try:
            # Remove leading slash and decode URL
            image_path = urllib.parse.unquote(self.path[1:])  # Remove leading /
            full_path = os.path.join(DIRECTORY, image_path)
            
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
            self.end_headers()
            self.wfile.write(image_data)
            
        except Exception as e:
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
    
    def handle_api_request(self):
        try:
            parsed_path = urllib.parse.urlparse(self.path)
            path_parts = parsed_path.path.split('/')
            
            if len(path_parts) >= 3 and path_parts[1] == 'api':
                action = path_parts[2]
                
                if action == 'data' and len(path_parts) >= 4:
                    filename = path_parts[3]
                    self.handle_data_request(filename)
                elif action == 'upload-image' and self.command == 'POST':
                    self.handle_image_upload()
                elif action == 'clear-all' and self.command == 'DELETE':
                    self.handle_clear_all()
                elif action == 'health' and self.command == 'GET':
                    self.handle_health_check()
                else:
                    self.send_error(404, "API endpoint not found")
            else:
                self.send_error(404, "Invalid API path")
                
        except Exception as e:
            self.send_error(500, f"Server error: {str(e)}")
    
    def handle_health_check(self):
        """Health check endpoint"""
        try:
            health_info = {
                "status": "ok",
                "database": "file_based",
                "timestamp": str(datetime.datetime.now())
            }
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(health_info).encode('utf-8'))
            
        except Exception as e:
            self.send_error(500, f"Health check failed: {str(e)}")
    
    def handle_data_request(self, filename):
        """Handle data file operations"""
        file_path = os.path.join(DB_DIRECTORY, f"{filename}.json")
        
        if self.command == 'GET':
            # Read data
            try:
                if os.path.exists(file_path):
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                else:
                    data = [] if filename not in ['login'] else {"logged_in": False}
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
                
            except json.JSONDecodeError as e:
                # Handle corrupted JSON files
                self.send_error(500, f"Corrupted JSON in {filename}: {str(e)}")
            except Exception as e:
                self.send_error(500, f"Error reading {filename}: {str(e)}")
        
        elif self.command == 'POST':
            # Write data
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                
                # Validate data before saving (especially for teams with images)
                if filename == 'teams' and isinstance(data, list):
                    data = self.validate_and_clean_teams_data(data)
                
                # Ensure db directory exists
                os.makedirs(DB_DIRECTORY, exist_ok=True)
                
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True}).encode('utf-8'))
                
            except json.JSONDecodeError as e:
                self.send_error(400, f"Invalid JSON data: {str(e)}")
            except Exception as e:
                self.send_error(500, f"Error writing {filename}: {str(e)}")
    
    def validate_and_clean_teams_data(self, teams_data):
        """Validate and clean teams data - chỉ lưu metadata, không lưu base64"""
        cleaned_teams = []
        
        for team in teams_data:
            if not isinstance(team, dict):
                continue
                
            # Validate required fields
            if 'name' not in team or 'id' not in team:
                continue
            
            # Clean team data - CHỈ LƯU METADATA
            cleaned_team = {
                'id': str(team.get('id', '')),
                'name': str(team.get('name', '')),
                'useIndexedDB': team.get('useIndexedDB', False)
            }
            
            # Chỉ lưu đường dẫn ảnh, KHÔNG lưu base64
            if 'imagePath' in team:
                cleaned_team['imagePath'] = str(team.get('imagePath', ''))
            elif 'image' in team and not team['image'].startswith('data:image/'):
                # Nếu có image nhưng không phải base64, coi như đường dẫn
                cleaned_team['imagePath'] = str(team.get('image', ''))
            else:
                # Không lưu base64, sử dụng đường dẫn mặc định
                cleaned_team['imagePath'] = 'images/default-team.png'
            
            cleaned_teams.append(cleaned_team)
        
        return cleaned_teams
    
    def handle_clear_all(self):
        """Clear all data files"""
        try:
            data_files = ['judges.json', 'teams.json', 'questions.json', 
                         'used_judges.json', 'used_questions.json']
            
            for file_name in data_files:
                file_path = os.path.join(DB_DIRECTORY, file_name)
                if os.path.exists(file_path):
                    with open(file_path, 'w', encoding='utf-8') as f:
                        json.dump([], f)
            
            # Reset login
            login_path = os.path.join(DB_DIRECTORY, 'login.json')
            with open(login_path, 'w', encoding='utf-8') as f:
                json.dump({"logged_in": False}, f)
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "message": "Đã xóa tất cả dữ liệu!"}).encode('utf-8'))
            
        except Exception as e:
            self.send_error(500, f"Error clearing data: {str(e)}")
    
    def handle_image_upload(self):
        """Handle image upload for teams"""
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            # Xử lý JSON với error handling tốt hơn
            try:
                data = json.loads(post_data.decode('utf-8'))
            except json.JSONDecodeError as e:
                raise ValueError(f"Invalid JSON format: {str(e)}")
            
            # Extract image data and metadata
            image_data = data.get('imageData', '')
            team_name = data.get('teamName', '')
            team_id = data.get('teamId', '')
            
            if not image_data or not image_data.startswith('data:image/'):
                raise ValueError("Invalid image data format")
            
            # Parse the data URL
            header, base64_data = image_data.split(',', 1)
            image_type = header.split('/')[1].split(';')[0]  # e.g., 'png', 'jpeg'
            
            # Generate unique filename
            file_id = str(uuid.uuid4())
            filename = f"{file_id}.{image_type}"
            file_path = os.path.join(IMAGES_DIRECTORY, filename)
            
            # Ensure images directory exists
            os.makedirs(IMAGES_DIRECTORY, exist_ok=True)
            
            # Decode and save image
            image_bytes = base64.b64decode(base64_data)
            with open(file_path, 'wb') as f:
                f.write(image_bytes)
            
            # Return the relative path for JSON storage
            relative_path = f"images/teams/{filename}"
            
            # Return response in the same format as MongoDB version
            response_data = {
                "success": True,
                "image_id": file_id,
                "imagePath": relative_path,
                "original_size": len(image_bytes),
                "optimized_size": len(image_bytes),  # No optimization in basic version
                "dimensions": {"width": 0, "height": 0}  # No dimension detection in basic version
            }
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
            
        except Exception as e:
            self.send_error(500, f"Error uploading image: {str(e)}")

def main():
    try:
        # Ensure directories exist
        os.makedirs(DB_DIRECTORY, exist_ok=True)
        os.makedirs(IMAGES_DIRECTORY, exist_ok=True)
        
        with socketserver.TCPServer((HOST, PORT), CustomHTTPRequestHandler) as httpd:
            print(f"🎮 Game Show Server với API đang chạy...")
            print(f"🌐 Local URL: http://localhost:{PORT}")
            # print(f"🌍 Public URL: http://{PUBLIC_IP}:{PORT}") # Bỏ ghi chú dòng này khi deploy
            print(f"📁 Thư mục: {DIRECTORY}")
            print(f"🗄️  Database: {DB_DIRECTORY}")
            print(f"🖼️  Images: {IMAGES_DIRECTORY}")
            print(f"⏹️  Nhấn Ctrl+C để dừng server")
            print("-" * 50)
            httpd.serve_forever()
    except PermissionError:
        print(f"❌ Lỗi: Không có quyền bind vào {HOST}:{PORT}")
        print("💡 Thử chạy với quyền Administrator hoặc sử dụng IP khác")
        sys.exit(1)
    except OSError as e:
        print(f"❌ Lỗi: {e}")
        print("💡 Kiểm tra IP và port có được sử dụng bởi ứng dụng khác không")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n👋 Server đã dừng!")

if __name__ == "__main__":
    main()