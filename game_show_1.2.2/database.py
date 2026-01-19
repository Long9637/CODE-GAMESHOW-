"""
Database Manager for Game Show Application using MongoDB
"""

import pymongo
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
import gridfs
from bson import ObjectId
import json
import os
from datetime import datetime
from PIL import Image, ImageFile
import io
import base64
import uuid
import logging
from typing import Dict, List, Optional, Any
import sys

# Enable loading of truncated images (helps with corrupted files)
ImageFile.LOAD_TRUNCATED_IMAGES = True

# === PYINSTALLER HELPER ===
if getattr(sys, 'frozen', False):
    # Chạy trong file .exe đã đóng gói
    application_path = os.path.dirname(sys.executable)
else:
    # Chạy trong môi trường phát triển bình thường
    application_path = os.path.dirname(os.path.abspath(__file__))
# ==========================

from config import (
    MONGODB_URL, MONGODB_DATABASE, COLLECTIONS, GRIDFS_BUCKET,
    MAX_IMAGE_SIZE, ALLOWED_IMAGE_TYPES, IMAGE_QUALITY, MAX_DIMENSION,
    DB_DIRECTORY 
    # S_DIRECTORY
)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DatabaseManager:
    def __init__(self):
        self.client = None
        self.db = None
        self.fs = None
        self.connected = False
        
    def connect(self):
        """Kết nối tới MongoDB"""
        try:
            self.client = MongoClient(
                MONGODB_URL,
                serverSelectionTimeoutMS=5000,  # 5 seconds timeout
                connectTimeoutMS=5000,
                socketTimeoutMS=5000
            )
            
            # Test connection
            self.client.admin.command('ping')
            
            self.db = self.client[MONGODB_DATABASE]
            self.fs = gridfs.GridFS(self.db, collection=GRIDFS_BUCKET)
            
            self.connected = True
            logger.info(f"Connected to MongoDB: {MONGODB_DATABASE}")
            
            # Tạo indexes
            self._create_indexes()
            
            return True
            
        except (ConnectionFailure, ServerSelectionTimeoutError) as e:
            logger.error(f"❌ Failed to connect to MongoDB: {e}")
            self.connected = False
            return False
    
    def _create_indexes(self):
        """Tạo các index cần thiết"""
        try:
            teams_collection = self.db[COLLECTIONS['teams']]
            
            # === FIX: Xóa index cũ không hợp lệ (nếu có) ===
            existing_indexes = teams_collection.index_information()
            if 'id_1' in existing_indexes:
                teams_collection.drop_index('id_1')
                logger.info("Dropped legacy index 'id_1' from teams collection.")

            # Index cho teams collection
            teams_collection.create_index("team_id", unique=True)
            teams_collection.create_index("name")
            
            # Index cho judges collection
            self.db[COLLECTIONS['judges']].create_index("name")
            
            # Index cho questions collection  
            self.db[COLLECTIONS['questions']].create_index("question")
            
            # Index cho images collection
            self.db[COLLECTIONS['images']].create_index("team_id")
            self.db[COLLECTIONS['images']].create_index("filename")
            
            logger.info("Database indexes created")
            
        except Exception as e:
            logger.error(f"Error creating indexes: {e}")
    
    def disconnect(self):
        """Ngắt kết nối MongoDB"""
        if self.client:
            self.client.close()
            self.connected = False
            logger.info("Disconnected from MongoDB")
    
    def is_connected(self):
        """Kiểm tra trạng thái kết nối"""
        if not self.connected or not self.client:
            return False
        try:
            # The ismaster command is cheap and does not require auth.
            self.client.admin.command('ping')
            return True
        except (ConnectionFailure, ServerSelectionTimeoutError):
            self.connected = False
            return False

    # =============== TEAM OPERATIONS ===============
    
    # lấy list
    def get_teams(self) -> List[Dict]:
        """Lấy danh sách tất cả các team"""
        if not self.is_connected():
            return []
        
        try:
            teams = list(self.db[COLLECTIONS['teams']].find({}, {'_id': 0, 'created_at': 0, 'updated_at': 0}))
            
            # Thêm thông tin ảnh cho mỗi team
            for team in teams:
                if 'image_id' in team:
                    team['imagePath'] = f"/api/image/{team['image_id']}"
                elif 'imagePath' in team:
                    # Giữ nguyên imagePath cũ nếu có
                    pass
                else:
                    team['imagePath'] = 'images/default-team.png'
                
                # Process datetime objects for JSON serialization
                for key, value in team.items():
                    if hasattr(value, 'isoformat'):  # datetime objects
                        team[key] = value.isoformat()
            
            return teams
            
        except Exception as e:
            logger.error(f"Error getting teams: {e}")
            return []
    
    def save_teams(self, teams_data: List[Dict]) -> bool:
        """Lưu danh sách teams bằng cách cập nhật hoặc chèn (upsert) để tránh mất dữ liệu."""
        if not self.is_connected():
            return False
        
        try:
            collection = self.db[COLLECTIONS['teams']]
            
            # Lặp qua dữ liệu team được gửi đến và upsert từng team
            for team in teams_data:
                if 'team_id' not in team or 'name' not in team:
                    continue
                
                filter_query = {'team_id': team['team_id']}
                
                # Tạo document để set hoặc update
                team_updates = {
                    'name': str(team['name']),
                    'updated_at': datetime.utcnow()
                }
                
                # Xử lý ảnh
                if 'image_id' in team:
                    team_updates['image_id'] = team['image_id']
                if 'imagePath' in team:
                    team_updates['imagePath'] = team['imagePath']
                
                # Tạo câu lệnh update hoàn chỉnh
                update_query = {
                    '$set': team_updates,
                    '$setOnInsert': {'team_id': team['team_id'], 'created_at': datetime.utcnow()}
                }
                collection.update_one(filter_query, update_query, upsert=True)
            return True
        except Exception as e:
            logger.error(f"Error saving teams: {e}")
            return False

    # Lưu team
    def save_team(self, team_data: Dict) -> bool:
        """Lưu một team mới vào database."""
        if not self.is_connected():
            return False
        
        try:
            collection = self.db[COLLECTIONS['teams']]
            
            # Đảm bảo các trường cần thiết tồn tại
            if 'team_id' not in team_data or 'name' not in team_data:
                logger.error("Team data is missing 'team_id' or 'name'.")
                return False
            
            team_data['created_at'] = datetime.utcnow()
            team_data['updated_at'] = datetime.utcnow()
            
            collection.insert_one(team_data)
            logger.info(f"Successfully saved team: {team_data['name']}")
            return True
            
        except Exception as e:
            logger.error(f"Error saving teams: {e}")
            return False
    
    # Xóa
    def delete_team(self, team_id: str) -> bool:
        """Xóa một team dựa trên team_id"""
        if not self.is_connected():
            return False
        logger.info(f"--- Attempting to delete team with id: '{team_id}' ---")

        try:
            # Tìm team để lấy image_id trước khi xóa
            team_doc = self.db[COLLECTIONS['teams']].find_one({'team_id': team_id})
            
            result = self.db[COLLECTIONS['teams']].delete_one({'team_id': team_id})

            if result.deleted_count > 0:
                logger.info(f"Successfully deleted team with id: {team_id}")
                
                # === LOGIC MỚI: Xóa ảnh liên quan trong GridFS ===
                if team_doc and 'image_id' in team_doc:
                    image_id_to_delete = team_doc['image_id']
                    image_meta = self.db[COLLECTIONS['images']].find_one_and_delete({'image_id': image_id_to_delete})
                    if image_meta and 'grid_file_id' in image_meta:
                        self.fs.delete(image_meta['grid_file_id'])
                        logger.info(f"Successfully deleted associated image with id: {image_id_to_delete}")

                return True
            else:
                logger.warning(f"Team with id: {team_id} not found for deletion.")
                return False
        except Exception as e:
            logger.error(f"Error deleting team {team_id}: {e}")
            return False
        
    # =============== IMAGE OPERATIONS ===============
    
    def save_team_image(self, image_data: str, team_name: str, team_id: str = None) -> Optional[Dict]:
        """
        Lưu ảnh team với chất lượng cao sử dụng GridFS
        Args:
            image_data: Base64 image data
            team_name: Tên team
            team_id: ID của team (optional)
        Returns:
            Dict với thông tin ảnh đã lưu hoặc None nếu lỗi
        """
        if not self.is_connected():
            logger.error("Cannot save image: Not connected to database")
            return None
            
        try:
            # Step 1: Parse and decode image
            logger.info("Step 1/5: Parsing and decoding image data...")
            if not image_data.startswith('data:image/'):
                raise ValueError("Invalid image data format")
            
            header, base64_data = image_data.split(',', 1)
            mime_type = header.split(':')[1].split(';')[0]
            
            if mime_type not in ALLOWED_IMAGE_TYPES:
                raise ValueError(f"Unsupported image type: {mime_type}")
            
            # Clean base64 data thoroughly - multiple passes to ensure all problematic characters are removed
            base64_data = base64_data.replace('\n', '').replace('\r', '').replace(' ', '').replace('\t', '')
            
            # Remove any non-ASCII characters from base64 data
            base64_data = ''.join(char for char in base64_data if ord(char) < 128)
            
            # More aggressive cleaning - only keep valid base64 characters, but be careful not to remove essential data
            import re
            
            # First, count how many valid base64 chars we have
            valid_chars = re.findall(r'[A-Za-z0-9+/=]', base64_data)
            original_length = len(base64_data)
            valid_length = len(valid_chars)
            
            if valid_length < original_length:
                logger.warning(f"Found {original_length - valid_length} invalid characters in base64 data")
            
            # Join valid characters
            base64_data = ''.join(valid_chars)
            
            # Remove any existing padding first, then add correct padding
            base64_data = base64_data.rstrip('=')
            
            # Add correct padding
            missing_padding = len(base64_data) % 4
            if missing_padding:
                base64_data += '=' * (4 - missing_padding)
                
            # Final validation of base64 characters (only A-Z, a-z, 0-9, +, /, =)
            if not re.match(r'^[A-Za-z0-9+/]*={0,3}$', base64_data):
                raise ValueError("Base64 string contains invalid characters")
                
            logger.info(f"Base64 data length after cleaning: {len(base64_data)} characters")
            
            # Additional validation - check that the length is valid for base64
            if len(base64_data) % 4 != 0:
                logger.error(f"Base64 data length is not multiple of 4: {len(base64_data)}")
                raise ValueError(f"Invalid base64 length: {len(base64_data)} characters")
            
            try:
                # Test decode with validation and altchars to handle different encodings
                image_bytes = base64.b64decode(base64_data, validate=True)
            except Exception as decode_error:
                logger.error(f"Base64 decode error: {decode_error}")
                logger.error(f"Problematic data length: {len(base64_data)}")
                # Try alternative decoding approaches
                try:
                    # Sometimes there might be URL-safe base64
                    logger.info("Trying URL-safe base64 decoding")
                    image_bytes = base64.urlsafe_b64decode(base64_data + '==')  # Add extra padding just in case
                except Exception:
                    logger.error(f"First 100 chars: {base64_data[:100]}")
                    logger.error(f"Last 100 chars: {base64_data[-100:]}")
                    raise ValueError(f"Invalid base64 data: {decode_error}")
            
            if len(image_bytes) > MAX_IMAGE_SIZE:
                raise ValueError(f"Image too large: {len(image_bytes)} bytes")
            
            # Additional check: verify we have enough bytes for a valid image
            if len(image_bytes) < 100:  # Even smallest valid images are > 100 bytes
                raise ValueError(f"Image data too small to be valid: {len(image_bytes)} bytes")
            
            # Check for basic image format signatures
            if image_bytes[:4] == b'\x89PNG':
                logger.info("Detected PNG format")
            elif image_bytes[:2] == b'\xff\xd8':
                logger.info("Detected JPEG format")
            elif image_bytes[:6] in (b'GIF87a', b'GIF89a'):
                logger.info("Detected GIF format")
            elif image_bytes[:4] == b'RIFF' and image_bytes[8:12] == b'WEBP':
                logger.info("Detected WebP format")
            else:
                logger.warning(f"Unknown image format signature: {image_bytes[:10].hex()}")
            
            logger.info("Step 1/5: Success")

            # Step 2: Optimize image for web display while keeping good quality
            logger.info("Step 2/5: Optimizing image for web display...")
            
            try:
                # Multiple attempts to handle different image formats and potential issues
                image = None
                original_width = original_height = 0
                
                # Attempt 1: Standard opening with immediate load
                try:
                    image = Image.open(io.BytesIO(image_bytes))
                    image.load()  # Force load all image data
                    original_width, original_height = image.size
                    logger.info(f"Successfully opened image: {original_width}x{original_height}, mode: {image.mode}")
                
                except Exception as e1:
                    logger.warning(f"Standard image opening failed: {e1}")
                    
                    # Attempt 2: Try with verify first, then reopen
                    try:
                        test_img = Image.open(io.BytesIO(image_bytes))
                        test_img.verify()  # Just verify structure
                        # Reopen after verify (verify closes the image)
                        image = Image.open(io.BytesIO(image_bytes))
                        original_width, original_height = image.size
                        logger.info(f"Verified and reopened image: {original_width}x{original_height}")
                    
                    except Exception as e2:
                        logger.warning(f"Verify approach failed: {e2}")
                        
                        # Attempt 3: Try with relaxed error handling
                        try:
                            # For PNG files with CRC errors, try to load with ignore errors
                            from PIL import ImageFile
                            ImageFile.LOAD_TRUNCATED_IMAGES = True
                            
                            temp_img = Image.open(io.BytesIO(image_bytes))
                            # Convert to RGB immediately to bypass format issues
                            image = temp_img.convert('RGB')
                            original_width, original_height = image.size
                            logger.info(f"Force converted to RGB with truncated load: {original_width}x{original_height}")
                        
                        except Exception as e3:
                            logger.warning(f"RGB conversion failed: {e3}")
                            
                            # Attempt 4: Try saving and reloading to fix corruption
                            try:
                                # Write raw bytes to temp buffer and try to recover
                                temp_buffer = io.BytesIO(image_bytes)
                                temp_img = Image.open(temp_buffer)
                                
                                # Save to new buffer with error recovery
                                recovery_buffer = io.BytesIO()
                                temp_img.save(recovery_buffer, format='PNG', optimize=False)
                                recovery_bytes = recovery_buffer.getvalue()
                                
                                # Try to reopen the recovered image
                                image = Image.open(io.BytesIO(recovery_bytes))
                                original_width, original_height = image.size
                                logger.info(f"Recovered corrupted image: {original_width}x{original_height}")
                                
                            except Exception as e4:
                                logger.error(f"All image opening methods failed: {e1}, {e2}, {e3}, {e4}")
                                raise ValueError(f"Cannot process image data - may be corrupted or in unsupported format")
                
                if image is None or original_width == 0:
                    raise ValueError("Failed to open image - no valid image data found")
                
                # Normalize color mode for consistent processing
                if image.mode in ('RGBA', 'LA'):
                    # Keep transparency modes as-is for now
                    pass
                elif image.mode == 'P':
                    # Convert palette images to RGBA to preserve potential transparency
                    if 'transparency' in image.info:
                        image = image.convert('RGBA')
                    else:
                        image = image.convert('RGB')
                elif image.mode not in ('RGB', 'L'):
                    # Convert other modes to RGB
                    image = image.convert('RGB')
                    
            except Exception as pil_error:
                logger.error(f"PIL image processing error: {pil_error}")
                logger.error(f"Image data appears to be corrupted or in an unsupported format")
                raise ValueError(f"Image data is corrupted or unsupported: {pil_error}")
            
            # Only resize if image is very large (over 2000px on any side)
            max_dimension = 1920  # Good for web display
            if max(original_width, original_height) > max_dimension:
                # Calculate resize ratio while maintaining aspect ratio
                ratio = min(max_dimension / original_width, max_dimension / original_height)
                new_width = int(original_width * ratio)
                new_height = int(original_height * ratio)
                
                try:
                    # Use high-quality resampling with error handling
                    logger.info(f"Attempting to resize from {original_width}x{original_height} to {new_width}x{new_height}")
                    
                    # For complex modes, convert to RGB first before resizing
                    if image.mode not in ('RGB', 'RGBA', 'L'):
                        logger.info(f"Converting from {image.mode} to RGB before resize")
                        image = image.convert('RGB')
                    
                    resized_image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
                    image = resized_image
                    logger.info(f"Successfully resized to {new_width}x{new_height}")
                    
                except Exception as resize_error:
                    logger.error(f"LANCZOS resize failed: {resize_error}")
                    # Try with simpler resampling method
                    try:
                        logger.info("Trying BILINEAR resampling as fallback")
                        if image.mode not in ('RGB', 'RGBA', 'L'):
                            image = image.convert('RGB')
                        resized_image = image.resize((new_width, new_height), Image.Resampling.BILINEAR)
                        image = resized_image
                        logger.info(f"Successfully resized with BILINEAR to {new_width}x{new_height}")
                    except Exception as fallback_error:
                        logger.error(f"All resize methods failed: {resize_error}, {fallback_error}")
                        # Use original image if resize fails
                        logger.warning("Using original image size due to resize failures")
                        pass
            else:
                logger.info("Image size is acceptable, no resizing needed")
            
            # Save optimized image with good quality and format handling
            output_buffer = io.BytesIO()
            
            try:
                if mime_type == 'image/png' or image.mode in ('RGBA', 'LA'):
                    # For PNG or images with transparency, save as PNG
                    image.save(output_buffer, format='PNG', optimize=True, compress_level=6)
                    logger.info("Saved as PNG format")
                else:
                    # For JPEG and other formats, convert to RGB first
                    if image.mode in ('RGBA', 'LA', 'P'):
                        # Create white background for transparent images
                        rgb_image = Image.new('RGB', image.size, (255, 255, 255))
                        if image.mode in ('RGBA', 'LA'):
                            rgb_image.paste(image, mask=image.split()[-1] if image.mode == 'RGBA' else None)
                        else:
                            rgb_image.paste(image)
                        image = rgb_image
                    
                    image.save(output_buffer, format='JPEG', quality=85, optimize=True, progressive=True)
                    logger.info("Saved as JPEG format")
                    
            except Exception as save_error:
                logger.error(f"Error saving optimized image: {save_error}")
                # Fallback: save as PNG with RGB conversion
                try:
                    if image.mode not in ('RGB', 'L'):
                        image = image.convert('RGB')
                    output_buffer = io.BytesIO()  # Reset buffer
                    image.save(output_buffer, format='PNG')
                    logger.info("Fallback: saved as PNG after RGB conversion")
                except Exception as fallback_error:
                    logger.error(f"Fallback save also failed: {fallback_error}")
                    raise ValueError(f"Cannot save processed image: {save_error}")
            
            optimized_bytes = output_buffer.getvalue()
            
            if len(optimized_bytes) == 0:
                raise ValueError("Image processing resulted in empty data")
                
            logger.info(f"Step 2/5: Success - optimized from {len(image_bytes)} to {len(optimized_bytes)} bytes ({((len(image_bytes) - len(optimized_bytes)) / len(image_bytes) * 100):.1f}% reduction)")

            # Step 3: Save to GridFS
            logger.info("Step 3/5: Saving image to GridFS...")
            file_id = str(uuid.uuid4())
            filename = f"{file_id}.{mime_type.split('/')[1]}"
            
            grid_file_id = self.fs.put(
                optimized_bytes,
                filename=filename,
                content_type=mime_type,
                team_name=team_name,
                team_id=team_id,
                upload_date=datetime.utcnow(),
                original_size=len(image_bytes),
                optimized_size=len(optimized_bytes),
                dimensions={'width': image.size[0], 'height': image.size[1]}
            )
            logger.info(f"Step 3/5: Success, GridFS file ID: {grid_file_id}")

            # Step 4: Save metadata to 'images' collection
            logger.info("Step 4/5: Saving metadata to 'images' collection...")
            image_doc = {
                'image_id': file_id,
                'grid_file_id': grid_file_id,
                'team_id': team_id,
                'team_name': team_name,
                'filename': filename,
                'mime_type': mime_type,
                'original_size': len(image_bytes),
                'optimized_size': len(optimized_bytes),
                'dimensions': {'width': image.size[0], 'height': image.size[1]},
                'created_at': datetime.utcnow()
            }
            
            self.db[COLLECTIONS['images']].insert_one(image_doc)
            logger.info("Step 4/5: Success")

            # Step 5: Return result
            logger.info("Step 5/5: Image saved successfully. Returning result.")
            return {
                'success': True,
                'image_id': file_id,
                'grid_file_id': str(grid_file_id),
                'original_size': len(image_bytes),
                'optimized_size': len(optimized_bytes),
                'dimensions': {'width': image.size[0], 'height': image.size[1]}
            }
            
        except Exception as e:
            # Log the full traceback for detailed debugging
            import traceback
            logger.error(f"Error saving team image: {e}\n{traceback.format_exc()}")
            return None
    
    def get_team_image(self, image_id: str) -> Optional[Dict]:
        """
        Lấy ảnh team từ GridFS theo image_id
        """
        if not self.is_connected():
            logger.error("Cannot get image: Not connected to database")
            return None
            
        try:
            logger.info(f"🔍 Getting image {image_id} from MongoDB...")
            
            # Lấy metadata từ collection 'images'
            image_doc = self.db[COLLECTIONS['images']].find_one({'image_id': image_id})
            
            if not image_doc:
                logger.warning(f"⚠️  Image metadata not found for ID: {image_id}")
                return None
                
            logger.info(f"📋 Image metadata found:")
            logger.info(f"   - Filename: {image_doc['filename']}")
            logger.info(f"   - MIME type: {image_doc['mime_type']}")
            logger.info(f"   - Original size: {image_doc['original_size']} bytes")
            logger.info(f"   - Optimized size: {image_doc['optimized_size']} bytes")
            logger.info(f"   - Dimensions: {image_doc['dimensions']['width']}x{image_doc['dimensions']['height']}")
            
            # Lấy dữ liệu ảnh từ GridFS
            grid_file = self.fs.get(image_doc['grid_file_id'])
            image_data = grid_file.read()
            
            logger.info(f"📤 Retrieved image data: {len(image_data)} bytes")
            
            if len(image_data) == 0:
                logger.error(f"❌ Image data is empty for ID: {image_id}")
                return None
            
            return {
                'data': image_data,
                'content_type': image_doc['mime_type'],
                'filename': image_doc['filename'],
                'size': len(image_data),
                'dimensions': image_doc['dimensions'],
                'team_name': image_doc['team_name']
            }
            
        except Exception as e:
            logger.error(f"❌ Error getting team image {image_id}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None
    
    # =============== GENERIC OPERATIONS ===============
    
    def get_data(self, collection_name: str) -> List[Dict]:
        """Lấy dữ liệu từ collection"""
        if not self.is_connected():
            return []
        
        # Kiểm tra collection có tồn tại trong cấu hình không
        if collection_name not in COLLECTIONS.values():
            logger.warning(f"Collection {collection_name} not found in configuration")
            return []
        
        try:
            # Convert datetime objects to strings for JSON serialization
            data = list(self.db[collection_name].find({}, {'_id': 0}))
            # Process data to make it JSON serializable
            processed_data = []
            for item in data:
                # Check if this is a wrapped primitive value
                if len(item) == 2 and 'value' in item and 'updated_at' in item:
                    # This was a primitive value wrapped in a document, extract just the value
                    processed_data.append(item['value'])
                else:
                    # This is a proper document, process datetime objects
                    for key, value in item.items():
                        if hasattr(value, 'isoformat'):  # datetime objects
                            item[key] = value.isoformat()
                    processed_data.append(item)
            return processed_data
        except Exception as e:
            logger.error(f"Error getting data from {collection_name}: {e}")
            return []
    
    def save_data(self, collection_name: str, data: List[Dict]) -> bool:
        """Lưu dữ liệu vào collection"""
        if not self.is_connected():
            logger.error("Cannot save data: Not connected to database")
            return False
        
        # Kiểm tra collection có tồn tại trong cấu hình không
        if collection_name not in COLLECTIONS.values():
            logger.error(f"Collection {collection_name} not found in configuration")
            return False
        
        try:
            # Xóa dữ liệu cũ
            self.db[collection_name].delete_many({})
            
            # Process data to make it BSON serializable
            processed_data = []
            for item in data:
                if isinstance(item, dict):
                    processed_item = item.copy()
                    # Process datetime objects
                    for key, value in processed_item.items():
                        if hasattr(value, 'isoformat'):  # datetime objects
                            processed_item[key] = value.isoformat()
                    processed_item['updated_at'] = datetime.utcnow()
                    processed_data.append(processed_item)
                else:
                    # Handle primitive values (numbers, strings, etc.) by wrapping in a document
                    processed_data.append({
                        'value': item,
                        'updated_at': datetime.utcnow()
                    })
            
            # Lưu dữ liệu mới
            if processed_data:
                self.db[collection_name].insert_many(processed_data)
            
            logger.info(f"Saved {len(processed_data)} items to {collection_name}")
            return True
            
        except Exception as e:
            logger.error(f"Error saving data to {collection_name}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
    
    def clear_all_data(self) -> bool:
        """Xóa tất cả dữ liệu"""
        if not self.is_connected():
            logger.error("Cannot clear data: Not connected to database")
            return False
        
        try:
            # Xóa collections
            for collection_name in COLLECTIONS.values():
                self.db[collection_name].delete_many({})
            
            # Xóa GridFS files
            try:
                # Xóa tất cả file trong GridFS bucket
                gridfs_files_collection = self.db[f"{GRIDFS_BUCKET}.files"]
                gridfs_chunks_collection = self.db[f"{GRIDFS_BUCKET}.chunks"]
                gridfs_files_collection.delete_many({})
                gridfs_chunks_collection.delete_many({})
            except Exception as e:
                logger.warning(f"Warning: Could not clear GridFS collections: {e}")
            
            # Reset login status
            self.db['users'].delete_many({'type': 'login_status'})
            self.db['users'].insert_one({
                'type': 'login_status',
                'logged_in': False,
                'updated_at': datetime.utcnow()
            })
            
            logger.info("Cleared all data from database")
            return True
            
        except Exception as e:
            logger.error(f"Error clearing data: {e}")
            return False
    
    # =============== MIGRATION OPERATIONS ===============
    
    def migrate_from_json_files(self) -> bool:
        """Migrate dữ liệu từ các file JSON sang MongoDB, xử lý cấu trúc dữ liệu mới."""
        if not self.is_connected():
            return False
        
        try:
            logger.info("Starting migration from JSON files...")
            
            # --- 1. MIGRATE TEAMS (với ảnh) ---
            teams_file = os.path.join(DB_DIRECTORY, 'teams.json')
            if os.path.exists(teams_file):
                # === LOGIC MỚI: XÓA DỮ LIỆU TEAM CŨ TRƯỚC KHI MIGRATE ===
                self.db[COLLECTIONS['teams']].delete_many({})
                logger.info("Cleared old team data.")

                with open(teams_file, 'r', encoding='utf-8') as f:
                    teams_data = json.load(f)
                
                for team in teams_data:
                    # Tìm ảnh cục bộ (nếu có) và upload lên GridFS
                    image_path_str = team.get('imagePath', '')
                    # === LOGIC MỚI: Chấp nhận cả đường dẫn 'images/' và '../../' ===
                    is_local_path = isinstance(image_path_str, str) and (image_path_str.startswith('images/') or image_path_str.startswith('../../'))

                    if is_local_path:
                        old_image_path = os.path.normpath(os.path.join(application_path, image_path_str))
                        if os.path.exists(old_image_path):
                            try:
                                with open(old_image_path, 'rb') as img_file:
                                    image_bytes = img_file.read()
                                
                                ext = os.path.splitext(old_image_path)[1].lower()
                                mime_type = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'}.get(ext, 'image/jpeg')
                                
                                base64_data = base64.b64encode(image_bytes).decode('utf-8')
                                image_data_url = f"data:{mime_type};base64,{base64_data}"
                                
                                result = self.save_team_image(image_data_url, team.get('name', 'Unknown Team'), team.get('team_id'))
                                
                                if result:
                                    team['image_id'] = result['image_id']
                                    # === FIX: Xóa imagePath cũ sau khi migrate thành công ===
                                    if 'imagePath' in team:
                                        del team['imagePath']
                                    logger.info(f"Migrated image for team '{team.get('name')}'")
                            except Exception as e:
                                logger.error(f"Failed to migrate image for team '{team.get('name')}': {e}")

                # === FIX: Dùng insert_many để chèn toàn bộ danh sách team đã xử lý ===
                if teams_data:
                    self.db[COLLECTIONS['teams']].insert_many(teams_data)
                
                logger.info("Migrated teams.json")

            # --- 2. MIGRATE JUDGES (với ảnh và cấu trúc câu hỏi mới) ---
            judges_file = os.path.join(DB_DIRECTORY, 'judges.json')
            if os.path.exists(judges_file):
                with open(judges_file, 'r', encoding='utf-8') as f:
                    judges_data = json.load(f)
                
                for judge in judges_data:
                    # Xử lý migrate ảnh (tương tự team)
                    if 'image' in judge and isinstance(judge.get('image'), str) and judge['image'].startswith('images/'):
                        old_image_path = os.path.join(application_path, judge['image'])
                        if os.path.exists(old_image_path):
                            try:
                                with open(old_image_path, 'rb') as img_file:
                                    image_bytes = img_file.read()
                                ext = os.path.splitext(old_image_path)[1].lower()
                                mime_type = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'}.get(ext, 'image/jpeg')
                                base64_data = base64.b64encode(image_bytes).decode('utf-8')
                                image_data_url = f"data:{mime_type};base64,{base64_data}"

                                # Tái sử dụng hàm save_team_image
                                result = self.save_team_image(image_data_url, judge.get('name', 'Unknown Judge'), judge.get('id'))
                                
                                if result:
                                    judge['image_id'] = result['image_id']
                                    # Đổi tên 'image' thành 'image_id' và xóa đường dẫn cũ
                                    if 'image' in judge: del judge['image']
                                    logger.info(f"Migrated image for judge '{judge.get('name')}'")
                            except Exception as e:
                                logger.error(f"Failed to migrate image for judge '{judge.get('name')}': {e}")
                
                # Lưu dữ liệu judge đã được xử lý (dùng hàm save_data)
                self.save_data(COLLECTIONS['judges'], judges_data)
                logger.info("Migrated judges.json")

            # --- 3. MIGRATE CÁC FILE CÒN LẠI (Đơn giản) ---
            other_files = ['questions', 'used_judges', 'used_questions', 'used_final_questions']
            for file_name in other_files:
                file_path = os.path.join(DB_DIRECTORY, f"{file_name}.json")
                if os.path.exists(file_path):
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    self.save_data(COLLECTIONS[file_name], data)
                    logger.info(f"Migrated {file_name}.json")

            # --- 4. MIGRATE LOGIN STATUS (Trường hợp đặc biệt) ---
            login_file = os.path.join(DB_DIRECTORY, 'login.json')
            if os.path.exists(login_file):
                with open(login_file, 'r', encoding='utf-8') as f:
                    login_data = json.load(f)
                self.db['users'].update_one(
                    {'type': 'login_status'},
                    {'$set': {'logged_in': login_data.get('logged_in', False), 'updated_at': datetime.utcnow()}},
                    upsert=True
                )
                logger.info("Migrated login.json")

            logger.info("Migration completed successfully!")
            return True
            
        except Exception as e:
            import traceback
            logger.error(f"Migration failed: {e}\n{traceback.format_exc()}")
            return False

# Singleton instance
db_manager = DatabaseManager()