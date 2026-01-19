// Hệ thống Game Show - JavaScript  
// Sử dụng MongoDB với API endpoints
// function exportToExcel() {
//     const teams = await loadDataFromFile('teams');
//     // Use library: SheetJS (xlsx)
//     const ws = XLSX.utils.json_to_sheet(teams);
//     const wb = XLSX.utils.book_new();
//     XLSX.utils.book_append_sheet(wb, ws, 'Teams');
//     XLSX.writeFile(wb, 'teams.xlsx');
// }
//Global var list:
let questionTimer = null; // Biến để kiểm soát bộ đếm giờ (setInterval)
const warningSound = new Audio('sounds/warning.mp3'); // Biến nhạc 10s cuối
let availableFinalJudges = []; // Lưu danh sách BGK cho vòng câu hỏi phụ

let finalRoundTimer = null;
let inFinalChallenge = false;
let finalChallengeJudgeId = null;
let finalChallengeQuestions = [];
let finalChallengeTotalQuestions = 0;

// Game Show Animation Functions
function createConfetti() {
    const confettiContainer = document.createElement('div');
    confettiContainer.className = 'confetti-container';
    document.body.appendChild(confettiContainer);

    for (let i = 0; i < 100; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.animationDelay = Math.random() * 3 + 's';
        confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
        confettiContainer.appendChild(confetti);
    }

    // Remove confetti after animation
    setTimeout(() => {
        confettiContainer.remove();
    }, 5000);
}

function showWinnerCelebration(teamName = "CHÚC MỪNG!") {
    const celebration = document.createElement('div');
    celebration.className = 'winner-celebration';
    celebration.innerHTML = `
        <div class="winner-content">
            <div class="winner-title">${teamName}</div>
            <div class="winner-subtitle">🎉 CHIẾN THẮNG! 🎉</div>
            <div class="firework"></div>
            <div class="firework"></div>
            <div class="firework"></div>
            <div class="firework"></div>
        </div>
    `;

    document.body.appendChild(celebration);
    createConfetti();

    // Auto remove after 5 seconds or click to close
    const autoRemove = setTimeout(() => {
        celebration.remove();
    }, 5000);

    celebration.addEventListener('click', () => {
        clearTimeout(autoRemove);
        celebration.remove();
    });
}

function addPulseEffect(element) {
    element.classList.add('pulse-effect');
    setTimeout(() => {
        element.classList.remove('pulse-effect');
    }, 3000);
}

function addShakeEffect(element) {
    element.classList.add('shake-effect');
    setTimeout(() => {
        element.classList.remove('shake-effect');
    }, 600);
}

function addSuccessFlash(element) {
    element.classList.add('success-flash');
    setTimeout(() => {
        element.classList.remove('success-flash');
    }, 1000);
}

// Update question number animation indices
// function updateQuestionNumberAnimations() {
//     const questionNumbers = document.querySelectorAll('.question-number');
//     questionNumbers.forEach((btn, index) => {
//         btn.style.setProperty('--index', index);
//     });
// }

// Update team card animation indices
function updateTeamCardAnimations() {
    const teamCards = document.querySelectorAll('.team-card');
    teamCards.forEach((card, index) => {
        card.style.setProperty('--index', index);
    });
}

/**
 * Hiển thị thông báo "toast" ở góc màn hình.
 * @param {string} message Nội dung thông báo.
 * @param {string} type Loại thông báo: 'info', 'success', 'error', 'warning'.
 * @param {number} duration Thời gian hiển thị (ms).
 * @param {object} actions Các nút hành động (ví dụ: { confirm: { text: 'Có', callback: () => {} } }).
 */
function showToast(message, type = 'info', duration = 4000, actions = null) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toastId = `toast-${Date.now()}`;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        info: 'fa-info-circle',
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle'
    };

    toast.innerHTML = `
        <div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fas ${icons[type]}"></i>
                <span class="toast-message">${message}</span>
            </div>
            ${actions ? `<div class="toast-actions" id="actions-${toastId}"></div>` : ''}
        </div>
    `;

    container.appendChild(toast);

    const hideToast = () => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => {
            try {
                container.removeChild(toast);
            } catch (e) {
                // Bỏ qua lỗi
            }
        });
    };

    let timeoutId = null;
    if (duration > 0) {
        timeoutId = setTimeout(hideToast, duration);
    }

    if (actions) {
        const actionsContainer = document.getElementById(`actions-${toastId}`);
        for (const key in actions) {
            const action = actions[key];
            const button = document.createElement('button');
            button.className = `toast-btn ${key}`;
            button.textContent = action.text;
            button.onclick = () => {
                if (action.callback) {
                    action.callback();
                }
                if (timeoutId) clearTimeout(timeoutId);
                hideToast();
            };
            actionsContainer.appendChild(button);
        }
    }
}

// API Configuration for MongoDB backend
const API_CONFIG = {
    baseUrl: '/api',
    endpoints: {
        data: '/api/data',
        uploadImage: '/api/upload-image',  
        clearAll: '/api/clear-all',
        health: '/api/health'
    }
};

// Utility functions for MongoDB API calls
// Removed old saveDataToFile function - now using API version

// API-based data loading and saving functions
async function loadDataFromFile(key, defaultValue = []) {
    // 1. Luôn thử lấy dữ liệu từ server trước
    console.log(`[CACHE CHECK] 🔎 Đang kiểm tra dữ liệu cho: '${key}'`);
    try {
        const response = await fetch(`/api/data/${key}`);
        if (response.ok) {
            const data = await response.json();
            // Cập nhật cache nếu thành công
            if (!window._dataCache) window._dataCache = {};
            window._dataCache[key] = data;
            console.log(`[CACHE CHECK] ✅ Tải MỚI và cache dữ liệu '${key}' từ server.`);
            return data;
        } else {
            // Nếu server lỗi (vd: 404, 500), thử dùng cache
            console.warn(`⚠️ Không thể tải '${key}' từ server (${response.status}). Thử sử dụng cache...`);
            if (window._dataCache && window._dataCache[key]) {
                console.log(`[CACHE CHECK] ↪️ Sử dụng dữ liệu từ CACHE cho '${key}'.`);
                return window._dataCache[key];
            }
            return defaultValue; // Nếu không có cache, trả về mặc định
        }
    } catch (error) {
        // Nếu mất kết nối mạng, thử dùng cache
        console.error(`❌ Lỗi kết nối khi tải '${key}':`, error);
        if (window._dataCache && window._dataCache[key]) {
            console.log(`[CACHE CHECK] ↪️ Mất kết nối, sử dụng dữ liệu từ CACHE cho '${key}'.`);
            return window._dataCache[key];
        }
        // Nếu không có cache và cũng không có mạng, trả về mặc định
        console.error(`❌ Không có kết nối và không có cache cho '${key}'.`);
        return defaultValue;
    }
}

async function saveDataToFile(key, data) {
    try {
        const response = await fetch(`/api/data/${key}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            // Update in-memory cache
            if (!window._dataCache) window._dataCache = {};
            window._dataCache[key] = data;
            console.log(`✅ Đã lưu ${key} thành công`);
            return true;
        } else {
            console.error(`Lỗi lưu ${key}:`, response.statusText);
            return false;
        }
    } catch (error) {
        console.error(`Error saving ${key}:`, error);
        return false;
    }
}

// Clear all data function
async function clearAllData() {
    try {
        const response = await fetch('/api/clear-all', {
            method: 'DELETE'
        });
        
        if (response.ok) {
            const result = await response.json();
            // Clear in-memory cache
            window._dataCache = {};
            showToast(result.message || 'Đã xóa tất cả dữ liệu!', 'success');
            // Refresh current screen
            location.reload();
            return true;
        } else {
            showToast('Lỗi khi xóa dữ liệu: ' + response.statusText, 'error');
            return false;
        }
    } catch (error) {
        console.error('Error clearing data:', error);
        showToast('Lỗi kết nối server khi xóa dữ liệu', 'error');
        return false;
    }
}

// Initialize file handles for better performance
// Auto-save data to files periodically
// Removed auto-save - data is now saved immediately via API

// Initialize file handles for better performance
async function initializeFileHandles() {
    if (!window.fileHandles) {
        window.fileHandles = {};
    }

    // IMPORTANT: do not call showDirectoryPicker automatically during page load
    // because browsers require a real user gesture (click) to open pickers.
    // If a storage directory handle exists in session, prompt restore via banner.
    if (!sessionStorage.getItem('fileHandles_restored')) {
        console.log('Storage directory was previously configured but not restored in this session.');
        // Banner đã được gỡ bỏ - sử dụng server-side storage
    }

    console.log('File handles initialized');
}

// Setup storage folder for auto-sync
// Removed setupStorageFolder - now using server-side storage

// Backup tất cả dữ liệu từ cache ra file JSON (hoạt động offline)
async function backupOffline() {
    try {
        const dataKeys = ['judges', 'teams', 'questions', 'used_questions', 'used_judges', 'used_final_questions', 'login'];
        let exportedData = {};
        let missingKeys = [];

        // Lấy dữ liệu từ cache
        for (const key of dataKeys) {
            if (window._dataCache && window._dataCache[key]) {
                exportedData[key] = window._dataCache[key];
            } else {
                // Nếu chưa có trong cache, thử tải lần cuối
                console.log(`Cache cho '${key}' không tồn tại, thử tải lại...`);
                const data = await loadDataFromFile(key, null);
                if (data !== null) {
                    exportedData[key] = data;
                } else {
                    missingKeys.push(key);
                }
            }
        }

        if (missingKeys.length > 0) {
            showToast(`Không thể backup: ${missingKeys.join(', ')}. Hãy vào các màn hình quản lý ít nhất một lần.`, 'warning', 6000);
        }

        // Tạo và tải file JSON
        const jsonData = JSON.stringify(exportedData, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `gameshow_backup_${new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Backup dữ liệu offline thành công!', 'success');

    } catch (error) {
        console.error('Lỗi khi backup offline:', error);
        showToast('Lỗi khi backup dữ liệu: ' + error.message, 'error');
    }
}

// Khôi phục dữ liệu từ file JSON (hoạt động offline)
async function restoreOffline(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm("Bạn có chắc muốn khôi phục dữ liệu từ file này? Mọi dữ liệu hiện tại trên server sẽ bị ghi đè!")) {
        event.target.value = ''; // Reset input file
        return;
    }

    try {
        const fileContent = await file.text();
        const restoredData = JSON.parse(fileContent);
        
        let restoredCount = 0;
        for (const key in restoredData) {
            if (Object.hasOwnProperty.call(restoredData, key)) {
                const data = restoredData[key];
                const success = await saveDataToFile(key, data);
                if (success) {
                    console.log(`✅ Đã khôi phục '${key}' thành công.`);
                    restoredCount++;
                } else {
                    console.error(`❌ Lỗi khi khôi phục '${key}'.`);
                }
            }
        }

        showToast(`Đã khôi phục ${restoredCount} mục dữ liệu. Trang sẽ được tải lại.`, 'success');
        location.reload();

    } catch (error) {
        console.error('Error exporting data:', error);
        showToast('Lỗi khi khôi phục dữ liệu: ' + error.message, 'error');
    } finally {
        event.target.value = ''; // Reset input file để có thể chọn lại cùng file
    }
}// Initialize data with improved storage system
async function initializeData() {
    // Create db folder if it doesn't exist (this will be handled by the file operations)
    console.log('Initializing improved storage system...');

    // Initialize empty in-memory caches
    const dataKeys = ['judges', 'teams', 'questions', 'used_questions', 'used_judges'];
    if (!window._dataCache) window._dataCache = {};
    for (const key of dataKeys) {
        if (!window._dataCache[key]) window._dataCache[key] = [];
    }

    // Initialize file handles for better performance
    await initializeFileHandles();

    // Start auto-save
    startAutoSave();
}

// Hàm parse CSV text thành mảng questions
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const questions = [];
    
    // Parse header để xác định cấu trúc file
    const headerLine = lines[0].trim();
    const headers = parseCSVLine(headerLine);
    
    // Kiểm tra xem có phải format mới không (có nhiều cột ans_1, ans_2, ... và correct_ans)
    const hasMultipleAnswers = headers.includes('ans_1') && headers.includes('correct_ans');
    
    for (let i = 1; i < lines.length; i++) { // Bỏ header
        const line = lines[i].trim();
        if (!line) continue;
        
        // Xác định phần dựa trên thứ tự câu hỏi (58 câu đầu là phần 1, các câu còn lại là phần 2)
        const questionIndex = i - 1; // Index bắt đầu từ 0 (dòng 1 là câu 0)
        const questionPart = questionIndex < 58 ? 1 : 2;
        
        if (hasMultipleAnswers) {
            // Format mới: ques, ans_1, ans_2, ..., correct_ans
            // Số cột có thể khác nhau: 4, 5, 6 hoặc 7 cột (ques + 2-5 đáp án + correct_ans)
            const values = parseCSVLine(line);
            
            if (values.length >= 4) { // Ít nhất 4 cột (ques + 2 đáp án + correct_ans)
                const ques = values[0];
                
                // Cột cuối cùng là correct_ans (sau khi đã xóa cột time khỏi file CSV)
                const correct_ans = values[values.length - 1] || '';
                
                // Các cột giữa (từ 1 đến length-2) là các đáp án
                const answerCount = values.length - 2; // Trừ ques và correct_ans
                const ans_1 = values[1] || '';
                const ans_2 = values[2] || '';
                const ans_3 = values.length > 3 ? (values[3] || '') : '';
                const ans_4 = values.length > 4 ? (values[4] || '') : '';
                const ans_5 = values.length > 5 ? (values[5] || '') : '';
                
                // Tạo đối tượng câu hỏi với cấu trúc mới
                const answerOptions = {
                    A: ans_1,
                    B: ans_2,
                    C: ans_3,
                    D: ans_4,
                    E: ans_5
                };
                
                // Tạo text answer để hiển thị
                let answerText = '';
                if (ans_1) answerText += `A: ${ans_1}\n`;
                if (ans_2) answerText += `B: ${ans_2}\n`;
                if (ans_3) answerText += `C: ${ans_3}\n`;
                if (ans_4) answerText += `D: ${ans_4}\n`;
                if (ans_5) answerText += `E: ${ans_5}\n`;
                answerText += `\nĐáp án đúng: ${correct_ans.toUpperCase()}`;
                
                questions.push({
                    part: questionPart,
                    question: ques,
                    answer_options: answerOptions,
                    correct_answer: correct_ans.toUpperCase().trim(),
                    answer: answerText,
                    time: 300 // Sử dụng thời gian mặc định là 300 giây
                });
            }
        } else {
            // Format cũ: ques, ans
            const match = line.match(/^"([^"]*)","([^"]*)"$/);
            if (match) {
                const ques = match[1].replace(/""/g, '"');
                const ans = match[2].replace(/""/g, '"');
                questions.push({
                    part: questionPart,
                    question: ques,
                    answer: ans
                });
            } else {
                const parts = line.split(',');
                if (parts.length >= 2) {
                    const ques = parts[0].trim();
                    const ans = parts.slice(1).join(',').trim();
                    questions.push({
                        part: questionPart,
                        question: ques,
                        answer: ans,
                        time: 300  // Default 5 minutes for questions loaded from CSV
                    });
                }
            }
        }
    }
    return questions;
}

// Hàm helper để parse một dòng CSV với xử lý dấu ngoặc kép
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Escaped quote
                current += '"';
                i++; // Skip next quote
            } else {
                // Toggle quote state
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // End of field
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    // Add last field
    result.push(current.trim());
    
    return result;
}

// Hàm load questions từ CSV
async function loadQuestionsFromCSV(showAlert = false) {
    const csvFiles = ['data/cau_hoi_dap_an_new.csv']; // File CSV mới với nhiều cột đáp án
    let allCsvQuestions = [];

    for (const file of csvFiles) {
        try {
            const urlWithCacheBust = `${file}?t=${Date.now()}`;
            console.log(`[CSV LOAD] 🚀 Bắt đầu tải file CSV từ: ${urlWithCacheBust}`);
            // Thêm timestamp để tránh trình duyệt cache file CSV
            const response = await fetch(urlWithCacheBust);
            if (!response.ok) {
                const errorMsg = `Không thể tải file ${file}`;
                console.warn(errorMsg);
                if (showAlert) showToast(errorMsg, 'error');
                continue;
            }
            const csvText = await response.text();
            console.log(`[CSV LOAD] ✅ Tải thành công file CSV. Bắt đầu phân tích...`);
            const csvQuestions = parseCSV(csvText);
            allCsvQuestions.push(...csvQuestions);
        } catch (error) {
            const errorMsg = `Lỗi khi load ${file}: ${error.message}`;
            console.error(errorMsg);
            if (showAlert) showToast(errorMsg, 'error');
        }
    }

    // Gán lại id theo thứ tự để đảm bảo không trùng
    allCsvQuestions.forEach((question, index) => {
        question.id = 'csv_' + (index + 1);
    });

    // Lấy questions hiện tại và xóa tất cả để đảm bảo chỉ có dữ liệu từ CSV
    let existingQuestions = await loadDataFromFile('questions', []);

    // XÓA TẤT CẢ QUESTIONS HIỆN TẠI để chỉ giữ dữ liệu từ CSV
    existingQuestions = [];

    // Thêm questions từ CSV
    const allQuestions = [...existingQuestions, ...allCsvQuestions];

    await saveDataToFile('questions', allQuestions);

    // Tính số câu hỏi theo phần
    const part1Count = allCsvQuestions.filter(q => q.part === 1).length;
    const part2Count = allCsvQuestions.filter(q => q.part === 2).length;
    
    const message = `Đã load ${allCsvQuestions.length} câu hỏi từ CSV (${part1Count} câu phần 1, ${part2Count} câu phần 2), tổng cộng ${allQuestions.length} câu hỏi.`;
    console.log(message);
    if (showAlert) {
        showToast(message, 'success');
        // Cập nhật thống kê nếu đang ở màn hình quản lý câu hỏi
        if (document.getElementById('questionManagement').classList.contains('active')) {
            await loadQuestionStats();
        }
    }
}

// Quản lý màn hình
function showScreen(screenId) {
    // Ẩn tất cả màn hình
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    // Hiển thị màn hình được chọn
    document.getElementById(screenId).classList.add('active');

    // === LOGIC MỚI: ĐỒNG BỘ TRẠNG THÁI FULLSCREEN ===
    // Khi chuyển màn hình, kiểm tra xem có đang ở chế độ fullscreen không
    // Nếu có, đảm bảo nút trên màn hình mới được cập nhật đúng
    if (document.body.classList.contains('fullscreen-mode')) {
        const newScreenBtn = document.querySelector(`#${screenId} [onclick*="toggleFullscreen"]`);
        if (newScreenBtn) newScreenBtn.innerHTML = '<i class="fas fa-compress"></i> Thoát Toàn Màn Hình';
    }

    // Cập nhật dữ liệu cho màn hình cụ thể
    switch(screenId) {
        case 'judgeManagement':
            loadJudges();
            break;
        case 'teamImages':
            loadTeams();
            break;
        case 'questionManagement':
            loadQuestionStats();
            break;
        case 'teamListScreen':
            loadTeamsGrid();
            break;
        case 'gameScreen':
            loadQuestionGrid();
            break;
        case 'gameScreen2':
            loadQuestionGrid2();
            break;
        case 'finalRound':
            loadFinalRoundJudges();
            break;
    }
}

// Hệ thống đăng nhập
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    document.querySelector('.header').classList.add('logged-in');
    document.getElementById('userInfo').style.display = 'block';
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    // Ẩn form login
    document.getElementById("loginForm").style.display = "none";
    
    // Hiện logo
    document.getElementById("appLogo").style.display = "block";

    // Hiện thông tin user
    document.getElementById("userInfo").style.display = "block";
    // Đăng nhập đơn giản (có thể tùy chỉnh)
    if (username === '1' && password === '1') {
        document.getElementById('userInfo').style.display = 'flex';
        showScreen('dashboardScreen');

        // Lưu trạng thái đăng nhập
        await saveDataToFile('login', { logged_in: true });
    } else {
        showToast('Tên đăng nhập hoặc mật khẩu không đúng!', 'error');
    }
    
});

// Đăng xuất
async function logout() {
    await saveDataToFile('login', { logged_in: false });
    document.getElementById('userInfo').style.display = 'none';
    showScreen('loginScreen');
    document.querySelector('.header').classList.remove('logged-in');
    // Reset form
    const form = document.getElementById('loginForm');
    form.style.display = 'block';
    form.reset();
}

// Kiểm tra trạng thái đăng nhập khi tải trang
window.addEventListener('load', async function() {
    await initializeData();
    // Không tự động load CSV, chỉ load khi người dùng click nút

    const loginData = await loadDataFromFile('login', { logged_in: false });
    if (loginData.logged_in) {
        document.getElementById('userInfo').style.display = 'flex';
        showScreen('dashboardScreen');
    } else {
        showScreen('loginScreen');
    }
});

// === QUẢN LÝ BAN GIÁM KHẢO ===

// Thêm/Sửa Ban Giám Khảo
// Thêm/Sửa BGK
document.getElementById('judgeForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const judgeId = document.getElementById('judgeId').value;
    const judgeName = document.getElementById('judgeName').value.trim();
    const judgeTitle = document.getElementById('judgeTitle').value.trim();
    const judgeImageFile = document.getElementById('judgeImageFile').files[0]; 

    // let judges = await loadDataFromFile('judges', []);

    //  Kiểm tra các trường thông tin cơ bản
    if (!judgeName) {
        showToast('Tên giám khảo không được để trống.', 'error');
        return;
    }
    if (!judgeTitle) {
        showToast('Chức vụ không được để trống.', 'error');
        return;
    }

    // Chỉ yêu cầu ảnh khi THÊM MỚI một giám khảo (khi judgeId đang rỗng)
    if (!judgeId && !judgeImageFile) {
        showToast('Vui lòng thêm ảnh đại diện cho giám khảo.', 'error');
        return;
    }

     //  Kiểm tra các khối câu hỏi phụ
     
     const questionBlocks = document.querySelectorAll('#judgeQuestionsContainer .question-block');

     if (questionBlocks.length < 2) {
        showToast('Mỗi giám khảo phải có ít nhất 2 câu hỏi phụ.', 'error');
        return;
    }

     for (let i = 0; i < questionBlocks.length; i++) {
         const block = questionBlocks[i];
         const questionNumber = i + 1;
 
         const questionText = block.querySelector('.judge-q-text').value.trim();
         const optionA = block.querySelector('.judge-q-opt-a').value.trim();
         const optionB = block.querySelector('.judge-q-opt-b').value.trim();
         const correctAnswer = block.querySelector('.judge-q-correct').value;
 
         if (!questionText) {
             showToast(`Nội dung câu hỏi phụ ${questionNumber} không được để trống.`, 'error');
             return;
         }
         if (!optionA || !optionB) {
             showToast(`Câu hỏi phụ ${questionNumber} phải có ít nhất 2 đáp án (A và B).`, 'error');
             return;
         }
         if (!correctAnswer) {
             showToast(`Bạn phải chọn đáp án đúng cho câu hỏi phụ ${questionNumber}.`, 'error');
             return;
         }
     }

     
    let judges = await loadDataFromFile('judges', []); 

    // === ĐỌC DỮ LIỆU CÂU HỎI TỪ CÁC BLOCK ===

    const extra_questions = [];

    questionBlocks.forEach(block => {
        const question = {
            question: block.querySelector('.judge-q-text').value.trim(),
            answer_options: {
                A: block.querySelector('.judge-q-opt-a').value.trim(),
                B: block.querySelector('.judge-q-opt-b').value.trim(),
                C: block.querySelector('.judge-q-opt-c').value.trim(),
                D: block.querySelector('.judge-q-opt-d').value.trim(),
            },
            correct_answer: block.querySelector('.judge-q-correct').value,
            time: parseInt(block.querySelector('.judge-q-time').value) || 60 // Đọc thời gian, mặc định 60s
        };
        // Chỉ thêm vào nếu có nội dung câu hỏi
        if (question.question) {
            extra_questions.push(question);
        }
    });

    let judgeImageData = null;
    if (judgeImageFile) {
        judgeImageData = await keepOriginalImage(judgeImageFile);
    }

    if (judgeId) {
        // Sửa BGK
        const index = judges.findIndex(j => j.id === judgeId);
        if (index !== -1) {
            const oldImage = judges[index].image;
            judges[index] = {
                ...judges[index],
                name: judgeName,
                title: document.getElementById('judgeTitle').value.trim(),
                type: document.getElementById('judgeType').value,
                image: judgeImageData || oldImage,
                extra_questions: extra_questions // Gán đối tượng câu hỏi mới
            };
            // Xóa thuộc tính cũ không còn dùng
            delete judges[index].question;
            delete judges[index].answer;
        }
    } else {
        // Thêm BGK mới
        const newJudge = {
            id: Date.now().toString(),
            name: judgeName,
            title: document.getElementById('judgeTitle').value.trim(),
            type: document.getElementById('judgeType').value,
            image: judgeImageData,
            extra_questions: extra_questions // Gán đối tượng câu hỏi mới
        };
        judges.push(newJudge);
    }

    await saveDataToFile('judges', judges);
    await loadJudges();
    resetJudgeForm();
    showToast('Đã lưu ban giám khảo thành công!', 'success');
});

// Hàm tạo ra một khối nhập liệu câu hỏi cho giám khảo trong trang quản lý
function addJudgeQuestion(questionData = null) {
    const container = document.getElementById('judgeQuestionsContainer');
    const questionIndex = container.getElementsByClassName('question-block').length;
    const questionId = `judge_question_${Date.now()}`;

    const questionBlock = document.createElement('div');
    questionBlock.className = 'question-block';
    questionBlock.id = questionId;

    // Dữ liệu mặc định nếu là câu hỏi mới
    const data = questionData || { question: '', answer_options: { A: '', B: '', C: '', D: '' }, correct_answer: '', time: 60 };

    questionBlock.innerHTML = `
        <div class="question-block-header">
            <h4>Câu hỏi phụ ${questionIndex + 1}</h4>
            <button type="button" onclick="removeJudgeQuestion('${questionId}')" class="btn btn-danger btn-small"><i class="fas fa-trash"></i></button>
        </div>
        <div class="form-group">
            <label>Nội dung câu hỏi:</label>
            <textarea class="judge-q-text" rows="2">${data.question}</textarea>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Đáp án A:</label><input type="text" class="judge-q-opt-a" value="${data.answer_options.A}"></div>
            <div class="form-group"><label>Đáp án B:</label><input type="text" class="judge-q-opt-b" value="${data.answer_options.B}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label>Đáp án C:</label><input type="text" class="judge-q-opt-c" value="${data.answer_options.C}"></div>
            <div class="form-group"><label>Đáp án D:</label><input type="text" class="judge-q-opt-d" value="${data.answer_options.D}"></div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Đáp án đúng:</label>
                <select class="judge-q-correct">
                    <option value="" ${data.correct_answer === '' ? 'selected' : ''}>-- Chọn --</option>
                    <option value="A" ${data.correct_answer === 'A' ? 'selected' : ''}>A</option>
                    <option value="B" ${data.correct_answer === 'B' ? 'selected' : ''}>B</option>
                    <option value="C" ${data.correct_answer === 'C' ? 'selected' : ''}>C</option>
                    <option value="D" ${data.correct_answer === 'D' ? 'selected' : ''}>D</option>
                </select>
            </div>
            <div class="form-group"><label>Thời gian (giây):</label><input type="number" class="judge-q-time" value="${data.time || 60}" min="10"></div>
        </div>
    `;
    container.appendChild(questionBlock);
}

// Hàm xóa một khối câu hỏi trong quản lý 
function removeJudgeQuestion(questionId) {
    if (confirm('Bạn có chắc muốn xóa câu hỏi này không?')) {
        document.getElementById(questionId).remove();
        // Cập nhật lại số thứ tự
        const container = document.getElementById('judgeQuestionsContainer');
        const blocks = container.getElementsByClassName('question-block');
        for (let i = 0; i < blocks.length; i++) {
            blocks[i].querySelector('h4').textContent = `Câu hỏi phụ ${i + 1}`;
        }
    }
}
// Tải danh sách BGK
async function loadJudges() {
    const judges = await loadDataFromFile('judges', []);
    const judgesList = document.getElementById('judgesList');

    if (judges.length === 0) {
        judgesList.innerHTML = '<p style="text-align: center; color: #718096;">Chưa có Ban Giám Khảo nào.</p>';
        return;
    }

    // Ảnh đại diện mặc định nếu BGK chưa có ảnh
    const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2NkZDVmYSI+PHBhdGggZD0iTTEyIDJBNCA0IDAgMCAwIDggNmE0IDQgMCAwIDAgNCA0IDQgNCAwIDAgMCA0LTQgNCA0IDAgMCAwLTQtNHptMCA5Yy0yLjY3IDAtOCAxLjM0LTggNHYzaDE2di0zYzAtMi42Ni01LjMzLTQtOC00eiIvPjwvc3ZnPg==';

    judgesList.innerHTML = judges.map(judge => `
        <div class="judge-item-card ${judge.type}">
            <img src="${judge.image || defaultAvatar}" alt="${judge.name}" class="judge-avatar" onclick="openImageModal('${judge.image || defaultAvatar}', '${judge.name}')">
            
            <div class="judge-info">
                <div class="judge-name">${judge.name}</div>
                <div class="judge-title">${judge.title}</div>
                <div class="judge-type-badge ${judge.type}">${judge.type === 'main' ? 'BGK Chính' : 'BGK Phụ'}</div>
            </div>

            <div class="item-actions">
                <button onclick="editJudge('${judge.id}')" class="btn btn-secondary btn-small">
                    <i class="fas fa-edit"></i> Sửa
                </button>
                <button onclick="deleteJudge('${judge.id}')" class="btn btn-danger btn-small">
                    <i class="fas fa-trash"></i> Xóa
                </button>
            </div>
        </div>
    `).join('');
}

// Sửa BGK
async function editJudge(judgeId) {
    const judges = await loadDataFromFile('judges', []);
    const judge = judges.find(j => j.id === judgeId);

    if (judge) {
        // --- Điền các thông tin cơ bản ---
        document.getElementById('judgeId').value = judge.id;
        document.getElementById('judgeName').value = judge.name;
        document.getElementById('judgeTitle').value = judge.title;
        document.getElementById('judgeType').value = judge.type;

        // --- Hiển thị ảnh cũ (nếu có) trong khu vực preview ---
        const judgeImagePreview = document.getElementById('judgeImagePreview');
        const judgePreviewImg = document.getElementById('judgePreviewImg');
        
        if (judge.image) {
            judgePreviewImg.src = judge.image;
            judgeImagePreview.style.display = 'block';
        } else {
            removePreview(); // Dùng hàm xóa preview nếu không có ảnh
        }
        document.getElementById('judgeImageFile').value = ''; // Luôn reset input file

        // --- Điền thông tin câu hỏi trắc nghiệm (nếu có) ---
        const container = document.getElementById('judgeQuestionsContainer');
        container.innerHTML = ''; // Xóa sạch
        if (judge.extra_questions && judge.extra_questions.length > 0) {
            judge.extra_questions.forEach(q => {
                addJudgeQuestion(q); // Gọi hàm add để tạo lại từng câu hỏi với dữ liệu đã có (bao gồm cả time)
        });
    }

    }
}
// Xóa BGK
async function deleteJudge(judgeId) {
    if (confirm('Bạn có chắc chắn muốn xóa Ban Giám Khảo này?')) {
        let judges = await loadDataFromFile('judges', []);
        judges = judges.filter(j => j.id !== judgeId);
        await saveDataToFile('judges', judges);
        await loadJudges();
    }
}

// Reset form BGK
function resetJudgeForm() {
    document.getElementById('judgeForm').reset(); // Lệnh này sẽ reset hầu hết các trường
    document.getElementById('judgeId').value = ''; // Đảm bảo ID được xóa
    removePreview('judgeImageFile', 'judgeImagePreview', 'judgePreviewImg');
    
    document.getElementById('judgeQuestionsContainer').innerHTML = '';
}

// Hàm mới để reset trạng thái "đã dùng" của giám khảo
async function resetFinalRoundState() {
    if (!confirm("Bạn có chắc muốn reset trạng thái 'đã dùng' của tất cả giám khảo và câu hỏi phụ không?")) {
        return;
    }
    try {
        // Xóa cả hai danh sách
        await saveDataToFile('used_final_questions', []);
        await saveDataToFile('used_judges', []);
        
        showToast("Đã reset toàn bộ trạng thái của vòng câu hỏi phụ.", 'success');

        // Tải lại giao diện để hiển thị tất cả giám khảo
        loadFinalRoundJudges();

    } catch (error) {
        console.error('Lỗi khi reset trạng thái vòng cuối:', error);
        showToast('Đã xảy ra lỗi. Vui lòng kiểm tra console.', 'error');
    }
}
// === QUẢN LÝ ẢNH ===

// Preview ảnh khi upload - sử dụng URL gốc cho preview
// nhận các ID làm tham số để dùng cho cả ban giám khảo
async function previewImage(input, previewContainerId, previewImageId) {
    const previewContainer = document.getElementById(previewContainerId);
    const previewImg = document.getElementById(previewImageId);

    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (!file.type.startsWith('image/')) {
            showToast('Vui lòng chọn file ảnh!', 'error');
            input.value = '';
            return;
        }
        
        const previewUrl = URL.createObjectURL(file);
        previewImg.src = previewUrl;
        previewImg.onload = () => {
            URL.revokeObjectURL(previewUrl);
        };
        previewContainer.style.display = 'block';
    }
}

// Nâng cấp hàm removePreview để nhận các ID làm tham số
function removePreview(fileInputId, previewContainerId, previewImageId) {
    document.getElementById(fileInputId).value = '';
    document.getElementById(previewContainerId).style.display = 'none';
    document.getElementById(previewImageId).src = '';
}

// Thêm ảnh đội
document.getElementById('teamForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const teamName = document.getElementById('teamName').value.trim();
    const teamImageFile = document.getElementById('teamImageFile').files[0];
    
    // Tải danh sách đội hiện tại
    let teams = await loadDataFromFile('teams', []);

    // Logic kiểm tra trùng tên
    const isNameDuplicate = teams.some(team => team.name.toLowerCase() === teamName.toLowerCase());
    if (isNameDuplicate) {
        showToast(`Lỗi: Tên đội "${teamName}" đã tồn tại. Vui lòng chọn một tên khác.`, 'error');
        return;
    }

    // Logic kiểm tra xem đã chọn file chưa
    if (!teamImageFile) {
        showToast('Vui lòng upload một file ảnh!', 'error');
        return;
    }
    
    // Xử lý và lưu ảnh
    try {
        const imageData = await keepOriginalImage(teamImageFile);
        saveTeam(teamName, imageData);
    } catch (error) {
        console.error('Error processing image:', error);
        showToast('Lỗi khi xử lý ảnh. Vui lòng thử lại.', 'error');
    }
});

// Hàm lưu đội với upload ảnh GridFS
async function saveTeam(teamName, imageData) {
    try {
        let imagePath = '';
        let imageId = null;
        
        // Tạo ID cho team trước
        const teamId = 'team_' + Date.now().toString();
        
        // Upload ảnh nếu có
        if (imageData && imageData.startsWith('data:image/')) {
            console.log('🖼️ Bắt đầu xử lý ảnh cho đội:', teamName);
            
            const uploadResult = await uploadImage(imageData, teamName, teamId);
            if (uploadResult.success) {
                imagePath = uploadResult.imagePath;
                imageId = uploadResult.image_id;
                console.log('✅ Ảnh đã được lưu vào MongoDB GridFS');
            } else {
                console.warn('⚠️ Upload ảnh thất bại, sử dụng ảnh mặc định:', uploadResult.error);
                showToast('Lỗi upload ảnh: ' + uploadResult.error + '. Sử dụng ảnh mặc định.', 'error', 6000);
                imagePath = 'images/teams/default.jpg';
            }
        } else {
            imagePath = 'images/default-team.png';
        }

        // Luôn load dữ liệu mới nhất từ MongoDB
        const currentTeams = await loadDataFromFile('teams', []);
        
        const newTeam = {
            team_id: teamId,
            name: teamName,
            imagePath: imagePath,
            useIndexedDB: false
        };
        
        // Thêm image_id nếu có
        if (imageId) {
            newTeam.image_id = imageId;
        }

        // Thêm team mới vào danh sách hiện tại
        currentTeams.push(newTeam);

        // Lưu vào MongoDB (chỉ metadata, ảnh đã lưu riêng trong GridFS)
        const success = await saveDataToFile('teams', currentTeams);
        
        if (success) {
            // Cập nhật giao diện
            await loadTeams();
            document.getElementById('teamForm').reset();
            removePreview('teamImageFile', 'imagePreview', 'previewImg');
            
            if (imageId) {
                showToast(`Đã thêm đội thành công! Ảnh đã được lưu vào DB.`, 'success');
            } else {
                showToast('Đã thêm đội thành công với ảnh mặc định!', 'success');
            }
        } else {
            showToast('Lỗi khi lưu team vào MongoDB. Vui lòng thử lại.', 'error');
        }
    } catch (error) {
        console.error('❌ Error saving team:', error);
        showToast('Lỗi khi lưu đội: ' + error.message, 'error');
    }
}

// Function giữ nguyên ảnh gốc hoàn toàn - không xử lý gì
function keepOriginalImage(file) {
    return new Promise((resolve, reject) => {
        // Kiểm tra định dạng file
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            reject(new Error('Định dạng ảnh không được hỗ trợ. Chỉ chấp nhận: JPEG, PNG, GIF, WEBP'));
            return;
        }

        // Đọc file gốc và chuyển thành base64 mà không xử lý gì
        const reader = new FileReader();
        
        reader.onload = () => {
            console.log(`✅ Giữ nguyên ảnh gốc: ${file.name}`);
            console.log(`� Kích thước file: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
            resolve(reader.result);
        };
        
        reader.onerror = () => {
            reject(new Error('Không thể đọc file ảnh'));
        };
        
        reader.readAsDataURL(file);
    });
}

// Function tạo preview nhỏ cho hiển thị
function createImagePreview(file, maxWidth = 200, maxHeight = 150, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = () => {
            // Calculate dimensions for preview
            let { width, height } = img;
            
            // Calculate scale to fit within maxWidth x maxHeight
            const scale = Math.min(maxWidth / width, maxHeight / height);
            const newWidth = width * scale;
            const newHeight = height * scale;
            
            // Set canvas dimensions
            canvas.width = newWidth;
            canvas.height = newHeight;
            
            // Draw image with good quality
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, newWidth, newHeight);
            
            // Convert to base64 with moderate quality for preview
            const previewDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(previewDataUrl);
        };
        
        img.onerror = () => {
            reject(new Error('Không thể tạo preview cho ảnh.'));
        };
        
        img.src = URL.createObjectURL(file);
    });
}

// Function upload ảnh với MongoDB GridFS
async function uploadImage(imageData, teamName, teamId = null) {
    try {
        console.log(`📤 Đang upload ảnh cho đội: ${teamName}`);
        console.log(`📏 Kích thước dữ liệu ảnh: ${(imageData.length / 1024 / 1024).toFixed(2)}MB`);
        
        // Clean and validate base64 data - remove all whitespace and non-ASCII characters
        let cleanImageData = imageData.replace(/[\s\n\r\t]/g, '');
        
        // Remove any non-ASCII characters
        cleanImageData = cleanImageData.replace(/[^\x00-\x7F]/g, '');
        
        // Validate base64 format
        if (!cleanImageData.startsWith('data:image/')) {
            throw new Error('Invalid image format - must be base64 data URL');
        }
        
        // Extract base64 part and validate
        const [header, base64Part] = cleanImageData.split(',');
        if (!base64Part) {
            throw new Error('Invalid base64 data - missing comma separator');
        }
        
        // More aggressive cleaning - only keep valid base64 characters
        let cleanBase64 = base64Part.replace(/[^A-Za-z0-9+/=]/g, '');
        
        // Remove any existing padding first, then add correct padding
        let paddedBase64 = cleanBase64.replace(/=+$/, '');
        
        // Add correct padding
        const missingPadding = paddedBase64.length % 4;
        if (missingPadding) {
            paddedBase64 += '='.repeat(4 - missingPadding);
        }
        
        // Final validation of base64 characters (only A-Z, a-z, 0-9, +, /, =)
        const base64Regex = /^[A-Za-z0-9+/]*={0,3}$/;
        if (!base64Regex.test(paddedBase64)) {
            console.error('Invalid base64 characters found in:', paddedBase64.slice(0, 100));
            throw new Error('Invalid base64 characters detected');
        }
        
        // Additional length validation
        if (paddedBase64.length % 4 !== 0) {
            throw new Error(`Invalid base64 length: ${paddedBase64.length} characters`);
        }
        
        // Test decode on client side to catch issues early
        try {
            const testBinary = atob(paddedBase64);
            console.log(`🔍 Client-side decode test: ${testBinary.length} bytes decoded`);
        } catch (e) {
            console.error('Client-side base64 decode test failed:', e);
            throw new Error(`Client-side base64 validation failed: ${e.message}`);
        }
        
        // Additional image validation - try to load it in a test Image object
        try {
            await new Promise((resolve, reject) => {
                const testImg = new Image();
                testImg.onload = () => {
                    console.log(`✅ Image validation successful: ${testImg.width}x${testImg.height}`);
                    resolve();
                };
                testImg.onerror = (e) => {
                    console.error('Image validation failed:', e);
                    reject(new Error('Image data appears to be corrupted'));
                };
                testImg.src = header + ',' + paddedBase64;
            });
        } catch (e) {
            console.error('Image validation error:', e);
            throw new Error(`Image validation failed: ${e.message}`);
        }
        
        // Reconstruct clean image data
        cleanImageData = header + ',' + paddedBase64;
        
        console.log(`🔧 Cleaned data size: ${(cleanImageData.length / 1024 / 1024).toFixed(2)}MB`);
        
        const requestBody = {
            imageData: cleanImageData,
            teamName: teamName,
            teamId: teamId
        };
        
        // Convert to JSON string with proper escaping
        const jsonString = JSON.stringify(requestBody);
        console.log(`📦 Request size: ${(jsonString.length / 1024 / 1024).toFixed(2)}MB`);
        
        const response = await fetch('/api/upload-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
            },
            body: jsonString
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Upload ảnh thành công:');
            console.log(`   - Image ID: ${result.image_id}`);
            console.log(`   - Path: ${result.imagePath}`);
            console.log(`   - Original size: ${(result.original_size / 1024 / 1024).toFixed(2)}MB`);
            console.log(`   - Optimized size: ${(result.optimized_size / 1024 / 1024).toFixed(2)}MB`);
            console.log(`   - Compression ratio: ${(((result.original_size - result.optimized_size) / result.original_size) * 100).toFixed(1)}%`);
            console.log(`   - Dimensions: ${result.dimensions.width}x${result.dimensions.height}`);
            
            return result;
        } else {
            const error = await response.text();
            console.error('❌ Lỗi upload ảnh:', error);
            return { success: false, error: error };
        }
    } catch (error) {
        console.error('❌ Error uploading image:', error);
        return { success: false, error: error.message };
    }
}

// Tải danh sách đội
async function loadTeams() {
    const teams = await loadDataFromFile('teams', []);
    const teamsList = document.getElementById('teamsList');

    if (!teams || teams.length === 0) {
        teamsList.innerHTML = '<p style="text-align: center; color: #718096;">Chưa có ảnh đội nào.</p>';
        return;
    }

    // Load image từ imagePath hoặc image_id
    const loadTeamImage = (team) => {
        // === LOGIC MỚI: Ưu tiên image_id nếu có ===
        // Backend sẽ luôn trả về imagePath là /api/image/{image_id} nếu ảnh tồn tại trong DB
        if (team.imagePath && team.imagePath.startsWith('/api/image/')) {
            return Promise.resolve(`${window.location.origin}${team.imagePath}`);
        }
        // Nếu không có image_id, thử dùng imagePath cũ (dành cho ảnh mặc định hoặc lỗi)
        if (team.image_id) {
            return Promise.resolve(`${window.location.origin}/api/image/${team.image_id}`);
        }
        
        // Fallback về image (base64) hoặc default
        return Promise.resolve(
            team.image || 
            'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDQwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRTJFOEYwIi8+Cjx0ZXh0IHg9IjIwMCIgeT0iMTUwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiM3MTgwOTYiIHRleHQtYW5jaG9yPSJtaWRkbGUiPk5vIEltYWdlPC90ZXh0Pgo8L3N2Zz4K'
        );
    };

    // Tải tất cả ảnh và hiển thị
    Promise.all(teams.map(team => loadTeamImage(team))).then(images => {
        teamsList.innerHTML = teams.map((team, index) => `
            <div class="team-item">
                <img src="${images[index]}" alt="${team.name}" class="team-image"
                     onclick="openImageModal('${images[index]}', '${team.name}')"
                     onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDQwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRTJFOEYwIi8+Cjx0ZXh0IHg9IjIwMCIgeT0iMTUwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiM3MTgwOTYiIHRleHQtYW5jaG9yPSJtaWRkbGUiPk5vIEltYWdlPC90ZXh0Pgo8L3N2Zz4K'">
                <div class="team-info">
                    <div class="team-name">${team.name}</div>
                </div>
                <div class="item-actions">
                    <button onclick="deleteTeam('${team.team_id}')" class="btn btn-danger btn-small">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    });
}

// Xóa đội
async function deleteTeam(teamId) {
    if (confirm('Bạn có chắc chắn muốn xóa ảnh đội này không?')) {
        try {
            const response = await fetch(`/api/data/teams/delete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ team_id: teamId }) // Gửi team_id trong body
            });

            if (response.ok) {
                await loadTeams();
                showToast('Đã xóa đội thành công.', 'success');
            } else {
                showToast('Lỗi: Không thể xóa đội.', 'error');
            }
        } catch (error) {
            console.error("Lỗi khi gửi yêu cầu xóa đội:", error);
            showToast("Đã xảy ra lỗi kết nối. Vui lòng thử lại.", 'error');
        }
    }

}

// Hiển thị ảnh ngẫu nhiên
async function showRandomTeamImage() {
    const teams = await loadDataFromFile('teams', []);

    if (!teams || teams.length === 0) {
        showToast('Chưa có ảnh đội nào để hiển thị!', 'warning');
        return;
    }

    const randomTeam = teams[Math.floor(Math.random() * teams.length)];
    const container = document.getElementById('randomImageContainer');
    const display = document.getElementById('randomImageDisplay');

    // Tải ảnh từ IndexedDB nếu cần (làm backup)
    const loadImage = (team) => {
        return new Promise((resolve) => {
            // Ưu tiên sử dụng ảnh trực tiếp từ dữ liệu
            if (team.image && team.image.startsWith('data:')) {
                resolve(team.image);
                return;
            }

            // Nếu không có ảnh trực tiếp, thử tải từ IndexedDB
            if (team.useIndexedDB) {
                initDB().then(() => {
                    const transaction = db.transaction(['teams'], 'readonly');
                    const store = transaction.objectStore('teams');
                    const request = store.get(team.id);

                    request.onsuccess = () => {
                        if (request.result && request.result.image) {
                            resolve(request.result.image);
                        } else {
                            resolve('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDQwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRTJFOEYwIi8+Cjx0ZXh0IHg9IjIwMCIgeT0iMTUwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiM3MTgwOTYiIHRleHQtYW5jaG9yPSJtaWRkbGUiPk5vIEltYWdlPC90ZXh0Pgo8L3N2Zz4K');
                        }
                    };

                    request.onerror = () => {
                        resolve('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDQwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRTJFOEYwIi8+Cjx0ZXh0IHg9IjIwMCIgeT0iMTUwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiM3MTgwOTYiIHRleHQtYW5jaG9yPSJtaWRkbGUiPk5vIEltYWdlPC90ZXh0Pgo8L3N2Zz4K');
                    };
                }).catch(() => {
                    resolve('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDQwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRTJFOEYwIi8+Cjx0ZXh0IHg9IjIwMCIgeT0iMTUwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiM3MTgwOTYiIHRleHQtYW5jaG9yPSJtaWRkbGUiPk5vIEltYWdlPC90ZXh0Pgo8L3N2Zz4K');
                });
            } else {
                resolve(team.image || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDQwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRTJFOEYwIi8+Cjx0ZXh0IHg9IjIwMCIgeT0iMTUwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiM3MTgwOTYiIHRleHQtYW5jaG9yPSJtaWRkbGUiPk5vIEltYWdlPC90ZXh0Pgo8L3N2Zz4K');
            }
        });
    };

    loadImage(randomTeam).then(imageSrc => {
        container.innerHTML = `
            <h4>${randomTeam.name}</h4>
            <img src="${imageSrc}" alt="${randomTeam.name}" class="team-image"
                 onclick="openImageModal('${imageSrc}', '${randomTeam.name}')"
                 onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDQwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRTJFOEYwIi8+Cjx0ZXh0IHg9IjIwMCIgeT0iMTUwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiM3MTgwOTYiIHRleHQtYW5jaG9yPSJtaWRkbGUiPk5vIEltYWdlPC90ZXh0Pgo8L3N2Zz4K'">
        `;

        display.style.display = 'block';
    });
}

// === QUẢN LÝ CÂU HỎI ===

// Thêm câu hỏi
document.getElementById('questionForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const questionPart = document.getElementById('questionPart').value;
    const questionText = document.getElementById('questionText').value;
    const questionAnswer = document.getElementById('questionAnswer').value;
    const questionTime = document.getElementById('questionTime').value;
    
    let questions = await loadDataFromFile('questions', []);
    
    const newQuestion = {
        id: Date.now().toString(),
        part: parseInt(questionPart),
        question: questionText,
        answer: questionAnswer,
        time: parseInt(questionTime) || 300  // Default to 300 seconds if not provided
    };
    
    questions.push(newQuestion);
    await saveDataToFile('questions', questions);
    
    loadQuestionStats();
    document.getElementById('questionForm').reset();
    // Reset time field to default value
    document.getElementById('questionTime').value = 300;
    
    showToast('Đã thêm câu hỏi thành công!', 'success');
});

// Nhập câu hỏi hàng loạt
async function importBulkQuestions() {
    const bulkText = document.getElementById('bulkQuestions').value.trim();
    
    if (!bulkText) {
        showToast('Vui lòng nhập dữ liệu câu hỏi!', 'error');
        return;
    }
    
    const lines = bulkText.split('\n');
    let questions = await loadDataFromFile('questions', []);
    let addedCount = 0;
    
    lines.forEach(line => {
        const parts = line.split('|');
        if (parts.length >= 3) {
            const part = parseInt(parts[0].trim());
            const question = parts[1].trim();
            const answer = parts[2].trim();
            const time = parts.length >= 4 ? parseInt(parts[3].trim()) : 300; // Optional 4th parameter for time
            
            if (part && question && answer) {
                const newQuestion = {
                    id: Date.now().toString() + '_' + addedCount,
                    part: part,
                    question: question,
                    answer: answer,
                    time: time || 300  // Default to 300 seconds if not provided or invalid
                };
                questions.push(newQuestion);
                addedCount++;
            }
        }
    });
    
    await saveDataToFile('questions', questions);
    loadQuestionStats();
    document.getElementById('bulkQuestions').value = '';
    
    showToast(`Đã thêm ${addedCount} câu hỏi thành công!`, 'success');
}

// Áp dụng thời gian cho tất cả câu hỏi
async function applyGlobalQuestionTime() {
    const globalTime = parseInt(document.getElementById('globalQuestionTime').value);
    
    if (!globalTime || globalTime < 1) {
        showToast('Vui lòng nhập thời gian hợp lệ (tối thiểu 1 giây)!', 'error');
        return;
    }
    
    // Xác nhận trước khi áp dụng
    const confirmed = confirm(`Bạn có chắc chắn muốn đặt thời gian ${globalTime} giây cho TẤT CẢ câu hỏi hiện có không?`);
    
    if (!confirmed) {
        return;
    }
    
    let questions = await loadDataFromFile('questions', []);
    
    if (questions.length === 0) {
        showToast('Không có câu hỏi nào để cập nhật!', 'warning');
        return;
    }
    
    // Cập nhật thời gian cho tất cả câu hỏi
    questions.forEach(question => {
        question.time = globalTime;
    });
    
    await saveDataToFile('questions', questions);
    
    showToast(`Đã cập nhật thời gian ${globalTime} giây cho ${questions.length} câu hỏi!`, 'success');
}

// Tải thống kê câu hỏi
async function loadQuestionStats() {
    const questions = await loadDataFromFile('questions', []);

    const totalCount = questions.length;
    const part1Count = questions.filter(q => q.part === 1).length;
    const part2Count = questions.filter(q => q.part === 2).length;

    document.getElementById('questionCount').textContent = totalCount;
    document.getElementById('part1Count').textContent = part1Count;
    document.getElementById('part2Count').textContent = part2Count;
}

// === GAME SCREEN ===

// Tải lưới câu hỏi
async function loadQuestionGrid() {
    const grid = document.getElementById('questionGrid');
    const usedQuestions = await loadDataFromFile('used_questions', []);
    const questions = await loadDataFromFile('questions', []);
    const part1Questions = questions.filter(q => q.part === 1);

    grid.innerHTML = '';

    for (let i = 1; i <= 58; i++) {
        const button = document.createElement('button');
        button.className = 'question-number';
        button.textContent = i;
        button.onclick = () => selectQuestion(i);

        if (usedQuestions.includes(i)) {
            button.classList.add('used');
            button.onclick = null;
        } else if (i > part1Questions.length) {
            // Disable nếu không có đủ câu hỏi
            button.classList.add('disabled');
            button.onclick = () => {
                addShakeEffect(button);
                showToast('Chưa đủ câu hỏi!', 'warning');
            };
        } else {
            // Add hover effect for available questions
            button.addEventListener('mouseenter', () => addPulseEffect(button));
        }

        grid.appendChild(button);
    }
    
    // Update animation indices for staggered entrance
    // updateQuestionNumberAnimations();
}

// Tải lưới câu hỏi cho Phần 2
async function loadQuestionGrid2() {
    const grid = document.getElementById('questionGrid2');
    const usedQuestions = await loadDataFromFile('used_questions', []);
    const questions = await loadDataFromFile('questions', []);
    const part2Questions = questions.filter(q => q.part === 2);

    grid.innerHTML = '';

    for (let i = 1; i <= 60; i++) {
        const button = document.createElement('button');
        button.className = 'question-number';
        button.textContent = i;
        button.onclick = () => selectQuestion2(i);

        if (usedQuestions.includes(`part2_${i}`)) {
            button.classList.add('used');
            button.onclick = null;
        } else if (i > part2Questions.length) {
            button.classList.add('disabled');
            // THÊM HIỆU ỨNG SHAKE
            button.onclick = () => {
                addShakeEffect(button);
                showToast('Chưa đủ câu hỏi phần 2!', 'warning');
            };
        } else {
            // THÊM HIỆU ỨNG PULSE KHI HOVER
            button.addEventListener('mouseenter', () => addPulseEffect(button));
        }

        grid.appendChild(button);
    }
}

// Chọn câu hỏi
async function selectQuestion(number) {
    const questions = await loadDataFromFile('questions', []);
    const part1Questions = questions.filter(q => q.part === 1);

    if (part1Questions.length === 0) {
        showToast('Chưa có câu hỏi nào!', 'error');
        return;
    }

    if (number > part1Questions.length) {
        showToast('Chưa đủ câu hỏi!', 'error');
        return;
    }

    // Chọn câu hỏi theo thứ tự (number - 1 là index)
    const selectedQuestion = part1Questions[number - 1];

    // Đánh dấu ô đã sử dụng
    let usedQuestions = await loadDataFromFile('used_questions', []);
    usedQuestions.push(number);
    await saveDataToFile('used_questions', usedQuestions);

    // Hiển thị câu hỏi
    showQuestionModal(selectedQuestion, `Câu hỏi số ${number}`);

    // Cập nhật lưới
    await loadQuestionGrid();
}

// Chọn câu hỏi cho Phần 2
async function selectQuestion2(number) {
    const questions = await loadDataFromFile('questions', []);
    const part2Questions = questions.filter(q => q.part === 2);

    if (part2Questions.length === 0) {
        showToast('Chưa có câu hỏi phần 2 nào!', 'error');
        return;
    }

    if (number > part2Questions.length) {
        showToast('Chưa đủ câu hỏi phần 2!', 'error');
        return;
    }

    // Chọn câu hỏi theo thứ tự (number - 1 là index)
    const selectedQuestion = part2Questions[number - 1];

    // Đánh dấu ô đã sử dụng (với prefix part2_ để phân biệt với phần 1)
    let usedQuestions = await loadDataFromFile('used_questions', []);
    usedQuestions.push(`part2_${number}`);
    await saveDataToFile('used_questions', usedQuestions);

    // Hiển thị câu hỏi
    showQuestionModal(selectedQuestion, `Câu hỏi Phần 2 số ${number}`);

    // Cập nhật lưới
    await loadQuestionGrid2();
}

// === VÒNG CHUNG KẾT ===

// Tải danh sách BGK cho vòng chung kết (với giao diện được đồng bộ)
async function loadFinalRoundJudges() {
    const judges = await loadDataFromFile('judges', []);
    const usedJudges = await loadDataFromFile('used_judges', []);
    const judgesGrid = document.getElementById('judgesGrid');
    
    const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2NkZDVmYSI+PHBhdGggZD0iTTEyIDJBNCA0IDAgMCAwIDggNmE0IDQgMCAwIDAgNCA0IDQgNCAwIDAgMCA0LTQgNCA0IDAgMCAwLTQtNHptMCA5Yy0yLjY3IDAtOCAxLjM0LTggNHYzaDE2di0zYzAtMi42Ni01LjMzLTQtOC00eiIvPjwvc3ZnPg==';

    if (judges.length === 0) {
        judgesGrid.innerHTML = '<p style="text-align: center; color: #718096;">Chưa có Ban Giám Khảo nào.</p>';
        return;
    }
    
    availableFinalJudges = judges.filter(judge => !usedJudges.includes(judge.id));
    
    if (availableFinalJudges.length === 0) {
        judgesGrid.innerHTML = '<p style="text-align: center; color: #718096;">Tất cả Ban Giám Khảo đã được sử dụng.</p>';
        return;
    }
    
    // TẠO HTML MỚI GIỐNG HỆT BÊN TRANG QUẢN LÝ (nhưng không có nút Sửa/Xóa)
    judgesGrid.innerHTML = availableFinalJudges.map(judge => `
        <button class="judge-item-card ${judge.type}" onclick="selectJudgeQuestion('${judge.id}')">
            <img src="${judge.image || defaultAvatar}" alt="${judge.name}" class="judge-avatar">
            
            <div class="judge-info">
                <div class="judge-name">${judge.name}</div>
                <div class="judge-title">${judge.title}</div>
                <div class="judge-type-badge ${judge.type}">${judge.type === 'main' ? 'BGK Chính' : 'BGK Phụ'}</div>
            </div>
        </button>
    `).join('');
}

// Chọn câu hỏi từ BGK

// 1. HÀM KHỞI ĐỘNG (Khi chọn giám khảo)
async function selectJudgeQuestion(judgeId) {
    const judge = availableFinalJudges.find(j => j.id === judgeId);

    if (judge && judge.extra_questions && judge.extra_questions.length > 0) {
        // Thiết lập trạng thái thử thách
        inFinalChallenge = true;
        finalChallengeJudgeId = judge.id;
        finalChallengeQuestions = judge.extra_questions
        finalChallengeTotalQuestions = judge.extra_questions.length;

        // Cập nhật giao diện modal
        document.getElementById('modalTitle').textContent = ``;
        const answerContainer = document.getElementById('answerOptions');
        answerContainer.innerHTML = '';
        document.getElementById('questionDisplay').innerHTML = `Thử thách từ BGK ${judge.name}`;

        // Tạo và chèn các khối câu hỏi vào modal-body
        judge.extra_questions.forEach((q, index) => {
            const questionBlock = document.createElement('div');
            questionBlock.className = 'challenge-question-block';
            questionBlock.id = `challenge-q-${index}`;
            
            let optionsHTML = '';
            ['A', 'B', 'C', 'D'].forEach(key => {
                if (q.answer_options[key]) {
                    optionsHTML += `<button class="final-answer-option" data-option="${key}" onclick="checkFinalChallengeAnswer(this, '${key}', '${q.correct_answer}', ${index})">${key}: ${q.answer_options[key]}</button>`;
                }
            });

            questionBlock.innerHTML = `
                <div class="challenge-question-header">
                    <div class="challenge-question-title">
                        <i class="fas fa-question-circle"></i>
                        <h4>Câu hỏi ${index + 1}</h4>
                    </div>
                    <p class="challenge-header-text">${q.question}</p>
                </div>
                <div class="final-answer-options">${optionsHTML}</div>

            `;
            answerContainer.appendChild(questionBlock);
        });

        // Vô hiệu hóa nút đóng modal
        const closeButton = document.querySelector('#questionModal .close-btn');
        if (closeButton) { closeButton.disabled = true; }

        // Bắt đầu timer tổng - Tính tổng thời gian từ các câu hỏi
        const totalTime = judge.extra_questions.reduce((sum, q) => {
            return sum + (q.time || 300); // Use question's time field, default to 300 if not set
        }, 0);
        startFinalChallengeTimer(totalTime);
        
        document.getElementById('questionModal').classList.add('active');
    } else {
        showToast('Ban giám khảo này chưa có câu hỏi phụ hoặc dữ liệu bị lỗi.', 'error');
    }
}

// 2. HÀM QUẢN LÝ TIMER
function startFinalChallengeTimer(duration) {
    clearInterval(finalRoundTimer);
    let timeLeft = duration;
    const timerDisplay = document.getElementById('countdown-timer');
    timerDisplay.textContent = timeLeft;
    timerDisplay.classList.remove('warning');

    finalRoundTimer = setInterval(() => {
        timeLeft--;
        timerDisplay.textContent = timeLeft;
        if (timeLeft <= 10 && timeLeft > 0) {
            timerDisplay.classList.add('warning');
            if (timeLeft === 10) warningSound.play();
        }
        if (timeLeft <= 0) {
            // Dùng isWin = false để báo hiệu là hết giờ
            endFinalChallenge(false, finalChallengeQuestions); 
        }
    }, 1000);
}

// 3. HÀM KIỂM TRA ĐÁP ÁN
async function checkFinalChallengeAnswer(button, selectedKey, correctKey, questionIndex) {
    const questionBlock = document.getElementById(`challenge-q-${questionIndex}`);
    // Ngăn người dùng click lại vào một câu hỏi đã được trả lời
    if (questionBlock.classList.contains('answered')) {
        return;
    }

    const options = questionBlock.querySelectorAll('.final-answer-option');
    
    // 1. Vô hiệu hóa tất cả các nút của câu hỏi này ngay lập tức để tránh click đúp
    options.forEach(opt => { 
        opt.onclick = null; 
    });

    // 2. Xử lý tô màu dựa trên việc trả lời đúng hay sai
    if (selectedKey === correctKey) {
        // === KỊCH BẢN 1: TRẢ LỜI ĐÚNG ===
        
        // Tô xanh nút đã chọn
        button.classList.add('correct');
        
        // Làm mờ tất cả các nút còn lại
        options.forEach(opt => {
            if (opt !== button) {
                opt.classList.add('disabled');
            }
        });

    } else {
        // === KỊCH BẢN 2: TRẢ LỜI SAI ===
        
        // Tô đỏ nút đã chọn
        button.classList.add('incorrect');
        
        options.forEach(opt => {
            // Tìm và tô xanh nút đáp án đúng
            if (opt.getAttribute('data-option') === correctKey) {
                opt.classList.add('correct');
            } 
            // Làm mờ các nút sai khác (không phải nút đã chọn, cũng không phải nút đúng)
            else if (opt !== button) {
                opt.classList.add('disabled');
            }
        });
    }

    // 3. Đánh dấu khối câu hỏi là đã trả lời
    questionBlock.classList.add('answered'); 

    // 4. Lưu trạng thái 'used' của câu hỏi này vào database
    const questionUniqueId = `${finalChallengeJudgeId}_${questionIndex}`;
    const usedFinalQuestions = await loadDataFromFile('used_final_questions', []);
    if (!usedFinalQuestions.includes(questionUniqueId)) {
        usedFinalQuestions.push(questionUniqueId);
        await saveDataToFile('used_final_questions', usedFinalQuestions);
    }
    
    // 5. Kiểm tra xem đã trả lời hết tất cả các câu hỏi chưa
    const answeredCount = document.querySelectorAll('.challenge-question-block.answered').length;
    if (answeredCount === finalChallengeTotalQuestions) {
        endFinalChallenge(true); // Nếu đã hết, kết thúc thử thách
    }
}

// 4. HÀM KẾT THÚC THỬ THÁCH

async function endFinalChallenge(isWin) {
    // 1. Dừng bộ đếm giờ và âm thanh
    clearInterval(finalRoundTimer);
    warningSound.pause();
    warningSound.currentTime = 0;

    // 2. Kích hoạt lại nút đóng modal
    const closeButton = document.querySelector('#questionModal .close-btn');
    if (closeButton) {
        closeButton.disabled = false;
    }

    // 3. Xử lý khi HẾT GIỜ
    if (!isWin) {
        // Hiện popup "Hết giờ!"
        const timesUpPopup = document.getElementById('timesUpPopup');
        if (timesUpPopup) {
            timesUpPopup.classList.add('show');
        }

        // Tìm tất cả các câu hỏi chưa trả lời
        const remainingBlocks = document.querySelectorAll('.challenge-question-block:not(.answered)');
        // Lặp qua và vô hiệu hóa tất cả các nút đáp án của chúng
        remainingBlocks.forEach(block => {
            const options = block.querySelectorAll('.final-answer-option');
            options.forEach(opt => {
                opt.onclick = null; // Xóa sự kiện click
                opt.style.cursor = 'not-allowed'; // Đổi con trỏ chuột
            });
        });

        // Đặt hẹn giờ để ẩn popup và hiện đáp án
        setTimeout(async () => { // Thêm async vào đây
            // Sau 3 giây, ẩn popup đi
            if (timesUpPopup) {
                timesUpPopup.classList.remove('show');
            }

            // Hiện đáp án đúng cho các câu đã bị vô hiệu hóa ở trên
            remainingBlocks.forEach(block => {
                const questionIndex = parseInt(block.id.split('-')[2]);
                const questionData = finalChallengeQuestions[questionIndex];
                if (!questionData) return;
                
                const correctKey = questionData.correct_answer;
                const options = block.querySelectorAll('.final-answer-option');
                
                options.forEach(opt => {
                    const optionKey = opt.getAttribute('data-option');
                    if (optionKey === correctKey) {
                        opt.classList.add('correct');
                    } else {
                        opt.classList.add('disabled');
                    }
                });
            });

            // Đánh dấu giám khảo là đã dùng (chuyển vào đây)
            if (inFinalChallenge && finalChallengeJudgeId) {
                let usedJudges = await loadDataFromFile('used_judges', []);
                if (!usedJudges.includes(finalChallengeJudgeId)) {
                    usedJudges.push(finalChallengeJudgeId);
                    await saveDataToFile('used_judges', usedJudges);
                }
            }

        }, 3000);
    } else { // Khi thắng (trả lời hết) 
        if (inFinalChallenge && finalChallengeJudgeId) {
            let usedJudges = await loadDataFromFile('used_judges', []);
            if (!usedJudges.includes(finalChallengeJudgeId)) {
                usedJudges.push(finalChallengeJudgeId);
                await saveDataToFile('used_judges', usedJudges);
            }
        }
    }
}

// Hàm định dạng thời gian từ giây sang mm:ss
function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) {
        return "00:00";
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const formattedSeconds = remainingSeconds < 10 ? '0' + remainingSeconds : remainingSeconds;
    return `${minutes}:${formattedSeconds}`;
}

// === MODAL CÂU HỎI ===

// Kiểm tra trắc nghiệm và tô màu
function checkAnswer(selectedElement, selectedOption, correctAnswer) {

    // --- BẮT ĐẦU DEBUGGING ---
    console.group('--- DEBUG: checkAnswer ---');
    console.log('1. Đáp án người dùng chọn (selectedOption):', `"${selectedOption}"`, `(Kiểu dữ liệu: ${typeof selectedOption})`);
    console.log('2. Đáp án đúng gốc từ câu hỏi (correctAnswer):', `"${correctAnswer}"`, `(Kiểu dữ liệu: ${typeof correctAnswer})`);
    
    const finalCorrectAnswer = (correctAnswer || '').trim().toUpperCase();
    console.log('3. Đáp án đúng đã xử lý (finalCorrectAnswer):', `"${finalCorrectAnswer}"`, `(Kiểu dữ liệu: ${typeof finalCorrectAnswer})`);
    // --- KẾT THÚC DEBUGGING ---

    clearInterval(warningSound); 
    warningSound.pause(); // Dừng sound

    clearInterval(questionTimer); // Dừng bộ đếm giờ đang chạy

    // Tìm và tắt hiệu ứng cảnh báo nếu nó đang bật
    const timerDisplay = document.getElementById('countdown-timer');
    if (timerDisplay) timerDisplay.classList.remove('warning');

    // Lấy tất cả các ô đáp án trong modal
    const options = document.querySelectorAll('.answer-option');
    
    // Vô hiệu hóa tất cả các lựa chọn để người dùng không thể chọn lại
    options.forEach(option => {
        option.style.pointerEvents = 'none'; // Ngăn việc click lại
    });

    // So sánh đáp án người dùng chọn vs đáp án đúng
    const isCorrect = selectedOption === finalCorrectAnswer;
    console.log(`4. So sánh: "${selectedOption}" === "${finalCorrectAnswer}"  -->  Kết quả: ${isCorrect}`);
    console.groupEnd();
    // --- KẾT THÚC DEBUGGING ---

    if (isCorrect) {
        // Nếu đúng tô xanh
        selectedElement.classList.add('correct');
        // Tô xám các ô còn lại
        options.forEach(option => {
            if (option !== selectedElement) {
                option.classList.add('disabled');
            }
        });
    } else {
        // Nếu sai tô đỏ
        selectedElement.classList.add('incorrect');
        // Tô xanh đáp án đúng
        options.forEach(option => {
            const optionValue = option.getAttribute('data-option');
            if (optionValue === finalCorrectAnswer) {
                option.classList.add('correct');
            }
            // Tô xám các ô sai còn lại (không phải ô đã chọn và cũng không phải đáp án đúng)
            else if (option !== selectedElement) {
                option.classList.add('disabled');
            }
        });
    }
}

// Hiển thị modal câu hỏi (cả 2 format mới và cũ)
function showQuestionModal(question, title) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('questionDisplay').innerHTML = `${question.question}`;
    
    // Lấy các element cần thiết
    const answerOptionsContainer = document.getElementById('answerOptions');
    const answerDisplay = document.getElementById('answerDisplay');
    const modalFooter = document.getElementById('modalFooter');

    // Reset lại trạng thái của modal trước khi hiển thị
    answerOptionsContainer.innerHTML = '';
    answerDisplay.style.display = 'none';
    if (modalFooter) modalFooter.style.display = 'none';

    // === LOGIC MỚI (ĐƠN GIẢN HƠN): ẨN/HIỆN NÚT "SANG PHẦN 2" ===
    const goToPart2Button = document.querySelector('#questionModal .btn-modal-nav');
    if (goToPart2Button) {
        // Kiểm tra xem màn hình Phần 2 có đang active không
        if (document.getElementById('gameScreen2').classList.contains('active')) {
            goToPart2Button.style.display = 'none'; // Ẩn nếu đang ở Phần 2
        } else {
            goToPart2Button.style.display = 'inline-flex'; // Hiện nếu đang ở Phần 1
        }
    }

    // START LOGIC TIMER
    clearInterval(warningSound); // Dừng sound
    warningSound.currentTime = 0; 

    clearInterval(questionTimer); 

    const COUNTDOWN_SECONDS = 150; // Mặc định 2 phút 30 giây
    let timeLeft = COUNTDOWN_SECONDS;

    const timerDisplay = document.getElementById('countdown-timer');
    const timesUpPopup = document.getElementById('timesUpPopup');

    if(timerDisplay) {
        timerDisplay.textContent = timeLeft;
        timerDisplay.classList.remove('warning');
    }
    if(timesUpPopup) timesUpPopup.classList.remove('show');

    questionTimer = setInterval(() => {
        timeLeft = timeLeft - 1; // Giảm thời gian còn lại đi 1
        if(timerDisplay) timerDisplay.textContent = formatTime(timeLeft); // Cập nhật số trên màn hình với định dạng mới

        if (timeLeft <= 10 && timeLeft > 0) {
            if(timerDisplay) timerDisplay.classList.add('warning');
        }
        if (timeLeft === 10) {
            warningSound.play();
        }
        if (timeLeft <= 0) {

            clearInterval(warningSound); 
            warningSound.pause(); // Dừng sound

            clearInterval(questionTimer); // Dừng đếm ngược

            if(timerDisplay) timerDisplay.classList.remove('warning'); // Tắt cảnh báo

            if(timesUpPopup) timesUpPopup.classList.add('show');
            
            const allOptions = document.querySelectorAll('.answer-option');
            allOptions.forEach(option => { option.style.pointerEvents = 'none'; });

            setTimeout(() => {
                if(timesUpPopup) timesUpPopup.classList.remove('show');
                
                const correctAnswerKey = (question.correct_answer || '').trim().toUpperCase(); // Đảm bảo đáp án đúng được trim()
                allOptions.forEach(option => {
                    const optionKey = option.getAttribute('data-option');
                    if (optionKey === correctAnswerKey) {
                        option.classList.add('correct');
                    } else {
                        option.classList.add('disabled');
                    }
                });
            }, 2000); 
        }
    }, 1000); 
    // END LOGIC TIMER 

    // Luôn xử lý format trắc nghiệm
    const options = question.answer_options || {};
    const optionKeys = ['A', 'B', 'C', 'D', 'E'];

    optionKeys.forEach(key => {
        // Nếu đáp án có nội dung thì tạo nút
        if (options[key] && options[key].trim() !== '') {
            const optionElement = document.createElement('div');
            optionElement.classList.add('answer-option');
            optionElement.setAttribute('data-option', key);
            optionElement.innerHTML = `
                <span class="option-prefix">${key}:</span>
                <span class="option-text">${options[key]}</span>
            `;
            optionElement.onclick = () => checkAnswer(optionElement, key, question.correct_answer);
            answerOptionsContainer.appendChild(optionElement);
        }
    });
    
    // Hiển thị modal
    document.getElementById('questionModal').classList.add('active');
}

// Hiển thị đáp án
function showAnswer() {
    document.getElementById('answerDisplay').style.display = 'block';
    document.getElementById('showAnswerBtn').style.display = 'none';
}

// Đóng modal
function closeModal() {
    document.getElementById('questionModal').classList.remove('active');
    
    // Dừng tất cả các timer
    clearInterval(questionTimer); // Timer vòng 1
    clearInterval(finalRoundTimer); // Timer vòng thử thách

    warningSound.pause();
    warningSound.currentTime = 0;
    
    const closeButton = document.querySelector('#questionModal .close-btn');
    if (closeButton) {
        closeButton.disabled = false;
    }
    // Nếu đang trong thử thách, reset trạng thái và tải lại lưới giám khảo
    if (inFinalChallenge) {
        inFinalChallenge = false;
        finalChallengeJudgeId = null;
        loadFinalRoundJudges();
    }
    
    const timerDisplay = document.getElementById('countdown-timer');
    if (timerDisplay) timerDisplay.classList.remove('warning');
}

// Đóng image modal
function closeImageModal() {
    document.getElementById('imageModal').classList.remove('active');
}

// Mở image modal
function openImageModal(src, title) {
    document.getElementById('fullSizeImage').src = src;
    document.getElementById('imageModalTitle').textContent = title;
    document.getElementById('imageModal').classList.add('active');
}

// Đóng modal khi click bên ngoài
document.getElementById('questionModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeModal();
    }
});

// Reset dữ liệu game (để test)
function resetGameData() {
    if (confirm('Bạn có chắc chắn muốn xóa tất cả dữ liệu? Hành động này không thể hoàn tác!')) {
        // Clear in-memory cache
        if (window._dataCache) {
            delete window._dataCache['judges'];
            delete window._dataCache['teams'];
            delete window._dataCache['questions'];
            delete window._dataCache['used_questions'];
            delete window._dataCache['used_judges'];
        }
        initializeData();
        alert('Đã reset tất cả dữ liệu!');
        location.reload();
    }
}

// Reset tất cả dữ liệu và load lại từ CSV
async function resetAllData() {
    if (confirm('Bạn có chắc chắn muốn xóa tất cả dữ liệu và load lại từ CSV?')) {
        // Clear all data files
        const dataKeys = ['judges', 'teams', 'questions', 'used_questions', 'used_judges'];
        for (const key of dataKeys) {
            await saveDataToFile(key, []);
        }

        // Xóa dữ liệu từ IndexedDB
        try {
            await initDB();
            const transaction = db.transaction(['teams'], 'readwrite');
            const store = transaction.objectStore('teams');
            store.clear();

            transaction.oncomplete = async () => {
                await initializeData();
                // Load lại từ CSV
                await loadQuestionsFromCSV(true);
            };
        } catch (error) {
            // Nếu không thể kết nối IndexedDB, vẫn tiếp tục
            await initializeData();
            await loadQuestionsFromCSV(true);
        }
    }
}

/**
 * Xáo trộn mảng tại chỗ bằng thuật toán Fisher-Yates.
 * @param {Array} array Mảng chứa các mục cần xáo trộn.
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Reset only questions and used_questions (do not touch teams, judges, login, etc.)
async function resetQuestionsOnly() {
    const performReset = async () => {
        try {
        const csvFiles = ['data/cau_hoi_dap_an_new.csv'];
        let allCsvQuestions = [];

        for (const file of csvFiles) {
            const response = await fetch(file + '?t=' + Date.now());
            if (!response.ok) throw new Error(`Không thể tải file ${file}`);
            const csvText = await response.text();
            const csvQuestions = parseCSV(csvText);
            allCsvQuestions.push(...csvQuestions);
        }

        // Gán lại ID cho chắc chắn
        allCsvQuestions.forEach((q, index) => q.id = 'csv_' + (index + 1));

        let part1Questions = allCsvQuestions.filter(q => q.part === 1);
        let part2Questions = allCsvQuestions.filter(q => q.part === 2);
        let otherQuestions = allCsvQuestions.filter(q => q.part !== 1 && q.part !== 2);

        shuffleArray(part1Questions);
        shuffleArray(part2Questions);

        const shuffledQuestions = [...part1Questions, ...part2Questions, ...otherQuestions];

        await saveDataToFile('questions', shuffledQuestions);
        await saveDataToFile('used_questions', []); // Reset trạng thái đã dùng

        // Cập nhật cache và giao diện
        if (window._dataCache) {
            window._dataCache['questions'] = shuffledQuestions;
            window._dataCache['used_questions'] = [];
        }
        if (document.getElementById('questionManagement').classList.contains('active')) {
            await loadQuestionStats();
        }

        showToast('Đã reset, xáo trộn và nạp lại câu hỏi thành công!', 'success');
        } catch (error) {
            console.error('Error resetting questions only:', error);
            showToast('Lỗi khi reset câu hỏi: ' + (error && error.message ? error.message : error), 'error');
        }
    };

    showToast(
        'Xóa tất cả câu hỏi và nạp lại từ CSV?',
        'warning',
        10000, // Tự đóng sau 10s
        {
            confirm: { text: 'Có, Reset', callback: performReset },
            cancel: { text: 'Không', callback: () => {} }
        }
    );
}

// Export dữ liệu
async function exportData() {
    const data = {
        judges: await loadDataFromFile('judges', []),
        teams: await loadDataFromFile('teams', []),
        questions: await loadDataFromFile('questions', []),
        usedQuestions: await loadDataFromFile('used_questions', []),
        note: 'Lưu ý: Tất cả ảnh được lưu trong IndexedDB của máy và không được export trong file này.'
    };

    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});

    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = 'gameshow_data.json';
    link.click();

    alert('Đã export dữ liệu! Lưu ý: Ảnh được lưu trong máy và không có trong file export.');
}



// === FULLSCREEN FUNCTIONS ===
// Toggle fullscreen mode
function toggleFullscreen() {
    const body = document.body;
    const header = document.querySelector('.header');
    const allBtns = document.querySelectorAll('[onclick*="toggleFullscreen"]');

    if (body.classList.contains('fullscreen-mode')) {
        // === THOÁT FULLSCREEN ===
        body.classList.remove('fullscreen-mode');
        header.style.display = 'block';

        // Thoát fullscreen của trình duyệt
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }

        // Cập nhật tất cả các nút
        allBtns.forEach(btn => {
            btn.innerHTML = '<i class="fas fa-expand"></i> Toàn Màn Hình';
        });

    } else {
        // === VÀO FULLSCREEN ===
        body.classList.add('fullscreen-mode');
        header.style.display = 'none';

        // Vào fullscreen của trình duyệt
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        }

        // Cập nhật tất cả các nút
        allBtns.forEach(btn => {
            btn.innerHTML = '<i class="fas fa-compress"></i> Thoát Toàn Màn Hình';
        });
    }
}

// Exit fullscreen when ESC is pressed
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        // Close modal first
        closeModal();

        // Exit browser fullscreen nếu đang bật
        if (document.fullscreenElement) {
            document.exitFullscreen();
        }

        // Exit custom fullscreen nếu có
        if (document.body.classList.contains('fullscreen-mode')) {
            // Gọi hàm toggleFullscreen không cần tham số
            toggleFullscreen();
        }
    }

    // Ctrl + E để export dữ liệu
    if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        exportData();
    }
});


console.log('🎮 Hệ thống Game Show đã sẵn sàng!');
console.log('💡 Phím tắt: ESC (đóng modal/thoát toàn màn hình), Ctrl+E (export dữ liệu)');

// Tải lưới các đội
async function loadTeamsGrid() {
    const teams = await loadDataFromFile('teams', []);
    const teamsGrid = document.getElementById('teamsGrid');
    
    if (!teams || teams.length === 0) {
        teamsGrid.innerHTML = '<p class="no-data">Chưa có đội nào được thêm. Vui lòng vào "Quản Lý Ảnh Đội" để thêm.</p>';
        return;
    }
    
    // Tải ảnh từ imagePath hoặc image_id
    const loadTeamImage = (team) => {
        // Ưu tiên imagePath nếu có
        if (team.imagePath) {
            // Nếu imagePath đã là URL đầy đủ, sử dụng luôn
            if (team.imagePath.startsWith('http')) {
                return Promise.resolve(team.imagePath);
            }
            // Nếu là path tương đối, tạo URL từ current origin
            return Promise.resolve(`${window.location.origin}${team.imagePath}`);
        }
        
        // Nếu có image_id, tạo API path
        if (team.image_id) {
            return Promise.resolve(`${window.location.origin}/api/image/${team.image_id}`);
        }
        
        // Fallback
        return Promise.resolve('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjRTJFOEYwIi8+Cjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjNzE4MDk2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5ObyBJbWFnZTwvdGV4dD4KPC9zdmc+Cg==');
    };
    
    // Tải tất cả ảnh và hiển thị
    Promise.all(teams.map(team => loadTeamImage(team))).then(images => {
        teamsGrid.innerHTML = teams.map((team, index) => `
            <div class="team-card" onclick="showScreen('gameScreen')" style="cursor: pointer;">
                <div class="team-card-image">
                    <img src="${images[index]}" alt="${team.name}" loading="lazy"
                         onclick="openImageModal('${images[index]}', '${team.name}')"
                         onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjRTJFOEYwIi8+Cjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjNzE4MDk2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5ObyBJbWFnZTwvdGV4dD4KPC9zdmc+Cg=='">
                </div>
                <div class="team-card-info">
                    <h3>${team.name}</h3>
                </div>
            </div>
        `).join('');
        // Add animation indices for staggered entrance
        updateTeamCardAnimations();
    });
}
// Cập nhật trong phần khởi tạo sự kiện hoặc thêm đoạn mã sau vào cuối file
document.addEventListener('DOMContentLoaded', function() {
    // Cập nhật nút "Bắt Đầu Game Show"
    const startGameButton = document.querySelector('.btn-game');
    if (startGameButton) {
        startGameButton.onclick = function() {
            showScreen('teamListScreen');
        };
    }
});