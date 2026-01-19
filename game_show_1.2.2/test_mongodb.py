#!/usr/bin/env python3
"""
Updated test script to validate MongoDB integration with new data structures.
"""

import sys
import uuid
from database import db_manager
from config import COLLECTIONS

def test_mongodb_connection():
    """Test kết nối MongoDB"""
    print("🔌 Testing MongoDB connection...")
    if db_manager.connect():
        print("✅ MongoDB connection successful!")
        return True
    else:
        print("❌ MongoDB connection failed!")
        return False

def test_judge_and_question_ops():
    """Test các thao tác với Judge (cấu trúc mới) và Question"""
    print("\n📝 Testing Judge (new structure) and Question operations...")
    
    # === CẬP NHẬT: Dùng cấu trúc dữ liệu mới cho giám khảo ===
    test_judges = [
        {
            "id": f"test_judge_{uuid.uuid4()}",
            "name": "Test Judge Alpha",
            "title": "Head Judge",
            "type": "main",
            "image": None,
            "extra_question": {
                "question": "Đây là câu hỏi test của giám khảo?",
                "answer_options": {
                    "A": "Lựa chọn 1",
                    "B": "Lựa chọn 2",
                    "C": "Lựa chọn 3",
                    "D": ""
                },
                "correct_answer": "A"
            }
        }
    ]
    
    if not db_manager.save_data(COLLECTIONS['judges'], test_judges):
        print("❌ Judges save failed!")
        return False
        
    retrieved_judges = db_manager.get_data(COLLECTIONS['judges'])
    # Kiểm tra xem có extra_question không
    if retrieved_judges and retrieved_judges[0].get('extra_question'):
        print("✅ Judges save & get with new structure working!")
    else:
        print("❌ Judges retrieval failed or data structure is incorrect!")
        return False

    # Test questions (không thay đổi)
    test_questions = [{"id": "q1", "part": 1, "question": "Câu hỏi test 1", "answer": "Đáp án 1"}]
    if not db_manager.save_data(COLLECTIONS['questions'], test_questions):
        print("❌ Questions save failed!")
        return False
    
    retrieved_questions = db_manager.get_data(COLLECTIONS['questions'])
    if retrieved_questions and retrieved_questions[0].get('question') == "Câu hỏi test 1":
        print("✅ Questions save & get working!")
    else:
        print("❌ Questions retrieval failed!")
        return False
        
    return True

def test_delete_operations():
    """=== MỚI: Test chức năng xóa riêng lẻ === """
    print("\n🔪 Testing single delete operations...")

    # Test xóa team
    team_id_to_delete = f"team_to_delete_{uuid.uuid4()}"
    test_team = [{"id": team_id_to_delete, "name": "Team To Delete"}]
    db_manager.save_teams(test_team) # Dùng save_teams để upsert

    if not db_manager.delete_team(team_id_to_delete):
        print("❌ Team delete function failed!")
        return False
    
    # Kiểm tra lại xem team đã thực sự bị xóa chưa
    remaining_teams = db_manager.get_teams()
    if any(t['id'] == team_id_to_delete for t in remaining_teams):
        print("❌ Team was not actually deleted from DB!")
        return False
    print("✅ Team delete function working!")

    # Test xóa judge
    judge_id_to_delete = f"judge_to_delete_{uuid.uuid4()}"
    test_judge = [{"id": judge_id_to_delete, "name": "Judge To Delete"}]
    db_manager.save_data(COLLECTIONS['judges'], test_judge)

    if not db_manager.delete_judge(judge_id_to_delete):
        print("❌ Judge delete function failed!")
        return False
        
    remaining_judges = db_manager.get_data(COLLECTIONS['judges'])
    if any(j['id'] == judge_id_to_delete for j in remaining_judges):
        print("❌ Judge was not actually deleted from DB!")
        return False
    print("✅ Judge delete function working!")

    return True

def test_image_operations():
    """Test image operations, bao gồm cả ảnh giám khảo"""
    print("\n🖼️ Testing image operations...")
    
    test_image_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
    image_data = f"data:image/png;base64,{test_image_base64}"
    
    # Test lưu ảnh team
    team_result = db_manager.save_team_image(image_data, "Test Team Image", "test_img_team_1")
    if not (team_result and team_result.get('success')):
        print("❌ Team image save failed!")
        return False
    print(f"✅ Team image saved with ID: {team_result['image_id']}")

    # === MỚI: Test lưu ảnh judge bằng cách tái sử dụng hàm save_team_image ===
    judge_result = db_manager.save_team_image(image_data, "Test Judge Image", "test_img_judge_1")
    if not (judge_result and judge_result.get('success')):
        print("❌ Judge image save failed!")
        return False
    print(f"✅ Judge image saved with ID: {judge_result['image_id']}")
    
    return True

def run_all_tests():
    """Chạy tất cả tests"""
    print("🧪 MongoDB Integration Test Suite (Updated)")
    print("=" * 50)
    
    # Luôn xóa sạch database trước khi test để đảm bảo môi trường sạch
    print("🧹 Clearing database before test run...")
    if not db_manager.connect() or not db_manager.clear_all_data():
        print("❌ Could not clear database before starting tests. Aborting.")
        return False
    
    tests = [
        ("Judge and Question Ops", test_judge_and_question_ops),
        ("Delete Operations", test_delete_operations),
        ("Image Operations", test_image_operations)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n🔍 Running: {test_name}")
        try:
            if test_func():
                passed += 1
                print(f"✅ {test_name} - PASSED")
            else:
                print(f"❌ {test_name} - FAILED")
        except Exception as e:
            print(f"❌ {test_name} - ERROR: {e}")
    
    # Dọn dẹp sau khi test
    print("\n🧹 Clearing database after test run...")
    db_manager.clear_all_data()

    print("\n" + "=" * 50)
    print(f"📊 Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! Backend logic is consistent with changes!")
        return True
    else:
        print(f"⚠️ {total - passed} test(s) failed. Please check the issues above.")
        return False

def main():
    try:
        success = run_all_tests()
        if db_manager.is_connected():
            db_manager.disconnect()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ An unexpected error occurred: {e}")
        if db_manager.is_connected():
            db_manager.disconnect()
        sys.exit(1)

if __name__ == "__main__":
    main()