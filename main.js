// --- 設定（時間割の定義） ---
const PERIODS = [
    { id: 1, start: "09:00", end: "10:30" },
    { id: 2, start: "10:40", end: "12:10" },
    { id: 3, start: "13:00", end: "14:30" },
    { id: 4, start: "14:40", end: "16:10" },
    { id: 5, start: "16:20", end: "17:50" },
    { id: 6, start: "18:00", end: "19:30" },
    { id: 7, start: "19:40", end: "21:10" }
];

// 0: 日, 1: 月, 2: 火, 3: 水, 4: 木, 5: 金, 6: 土
const DAYS = [1, 2, 3, 4, 5, 6]; // 月曜〜土曜を表示

// --- 状態管理 ---
let attendanceData = {}; // 形式: { "YYYY-MM-DD_periodId": true }
let subjectData = {}; // 形式: { "day_period": "科目名" } (例: "1_1": "数学")
let isEditingSchedule = false;
let html5QrcodeScanner = null;
let isScanning = false;
let currentWeekOffset = 0; // 0:今週, -1:先週, 1:来週...

// --- 初期化 ---
document.addEventListener("DOMContentLoaded", () => {
    loadAttendanceData();
    renderTimetable();
    renderStats();
    startClock();
    setupEventListeners();
});

// --- ローカルストレージの読み書き ---
function loadAttendanceData() {
    const saved = localStorage.getItem('attendanceData');
    if (saved) {
        attendanceData = JSON.parse(saved);
    }
    const savedSubjects = localStorage.getItem('subjectData');
    if (savedSubjects) {
        subjectData = JSON.parse(savedSubjects);
    }
}

function saveAttendanceData() {
    localStorage.setItem('attendanceData', JSON.stringify(attendanceData));
}

function saveSubjectData() {
    localStorage.setItem('subjectData', JSON.stringify(subjectData));
}

// --- UI描画 ---
function renderTimetable() {
    const tbody = document.getElementById('timetable-body');
    tbody.innerHTML = '';
    
    // 表示する週の基準日を計算
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + (currentWeekOffset * 7));
    
    // UIのラベルを更新
    const label = document.getElementById('current-week-label');
    const thisWeekBtn = document.getElementById('this-week-btn');
    if (currentWeekOffset === 0) {
        label.textContent = '今週の出席状況';
        thisWeekBtn.style.display = 'none';
    } else if (currentWeekOffset < 0) {
        label.textContent = `${Math.abs(currentWeekOffset)}週前の出席状況`;
        thisWeekBtn.style.display = 'inline-block';
    } else {
        label.textContent = `${currentWeekOffset}週先の出席状況`;
        thisWeekBtn.style.display = 'inline-block';
    }
    
    PERIODS.forEach(period => {
        const tr = document.createElement('tr');
        
        // 時限ラベル
        const th = document.createElement('td');
        th.className = 'period-label';
        th.textContent = period.id;
        tr.appendChild(th);
        
        // 各曜日のセル
        DAYS.forEach(day => {
            const td = document.createElement('td');
            
            // 出席記録用のキー (例: 2023-10-23_1)
            const targetDate = getDateForDayThisWeek(baseDate, day);
            const dateStr = formatDate(targetDate);
            const cellKey = `${dateStr}_${period.id}`;
            
            // 科目登録用のキー (例: 1_1 = 月曜1限)
            const subjectKey = `${day}_${period.id}`;
            
            td.dataset.key = cellKey;
            
            if (attendanceData[cellKey]) {
                td.classList.add('attended');
            }
            
            // 科目名表示/編集用の要素
            const subjectDiv = document.createElement('div');
            subjectDiv.className = 'subject-name';
            subjectDiv.dataset.subjectKey = subjectKey;
            subjectDiv.textContent = subjectData[subjectKey] || '';
            // 編集モードに応じて contenteditable を切り替え
            subjectDiv.contentEditable = isEditingSchedule;
            
            // 入力されたら保存
            subjectDiv.addEventListener('blur', (e) => {
                subjectData[subjectKey] = e.target.textContent.trim();
                saveSubjectData();
                renderStats(); // 統計を再計算
            });
            
            td.appendChild(subjectDiv);
            tr.appendChild(td);
        });
        
        tbody.appendChild(tr);
    });
}

// 今週の指定された曜日のDateオブジェクトを取得
function getDateForDayThisWeek(currentDate, targetDayNum) {
    const d = new Date(currentDate);
    const currentDayNum = d.getDay();
    const diff = targetDayNum - currentDayNum;
    d.setDate(d.getDate() + diff);
    return d;
}

// YYYY-MM-DD 形式の文字列にする
function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// --- 統計レポート描画 ---
function renderStats() {
    const container = document.getElementById('stats-container');
    container.innerHTML = '';
    
    const subjects = Object.keys(subjectData);
    if (subjects.length === 0) {
        container.innerHTML = '<p class="status-message">時間割に科目を設定すると、ここに出席状況が表示されます。</p>';
        return;
    }
    
    // 科目名でグループ化（同じ科目が週に複数回ある場合を考慮）
    const subjectStats = {};
    
    subjects.forEach(key => {
        const name = subjectData[key];
        if (!name) return;
        
        if (!subjectStats[name]) {
            subjectStats[name] = { count: 0, slots: [] };
        }
        subjectStats[name].slots.push(key);
    });
    
    if (Object.keys(subjectStats).length === 0) {
        container.innerHTML = '<p class="status-message">時間割に科目を設定すると、ここに出席状況が表示されます。</p>';
        return;
    }
    
    // 出席データを集計
    Object.keys(attendanceData).forEach(attKey => {
        const [dateStr, periodId] = attKey.split('_');
        const d = new Date(dateStr);
        const day = d.getDay();
        const slotKey = `${day}_${periodId}`;
        
        for (const [name, data] of Object.entries(subjectStats)) {
            if (data.slots.includes(slotKey)) {
                data.count++;
                break;
            }
        }
    });
    
    // カードの生成
    Object.entries(subjectStats).forEach(([name, data]) => {
        // 日本の大学の半期15回を基準。週に複数コマある場合は 15 * コマ数
        const totalClasses = data.slots.length * 15;
        let rate = Math.round((data.count / totalClasses) * 100);
        if (rate > 100) rate = 100;
        
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.innerHTML = `
            <div class="stat-title">${name}</div>
            <div class="stat-count">${data.count} <span style="font-size: 0.8rem; font-weight: normal; color: #94a3b8;">/ ${totalClasses} 回</span></div>
            <div class="stat-progress-bar">
                <div class="stat-progress-fill" style="width: ${rate}%;"></div>
            </div>
            <div class="stat-meta">
                <span>出席率</span>
                <span>${rate}%</span>
            </div>
        `;
        container.appendChild(card);
    });
}

// --- 時計 ---
function startClock() {
    const display = document.getElementById('current-time-display');
    const updateTime = () => {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        display.textContent = `${h}:${m}`;
    };
    updateTime();
    setInterval(updateTime, 1000);
}

// --- イベントリスナー ---
function setupEventListeners() {
    // 週ナビゲーション
    document.getElementById('prev-week-btn').addEventListener('click', () => {
        currentWeekOffset--;
        renderTimetable();
    });
    document.getElementById('next-week-btn').addEventListener('click', () => {
        currentWeekOffset++;
        renderTimetable();
    });
    document.getElementById('this-week-btn').addEventListener('click', () => {
        currentWeekOffset = 0;
        renderTimetable();
    });

    document.getElementById('start-scan-btn').addEventListener('click', startScanner);
    document.getElementById('stop-scan-btn').addEventListener('click', stopScanner);
    
    // 時間割編集ボタン
    const editBtn = document.getElementById('edit-schedule-btn');
    editBtn.addEventListener('click', () => {
        isEditingSchedule = !isEditingSchedule;
        const table = document.getElementById('timetable');
        
        if (isEditingSchedule) {
            table.classList.add('is-editing');
            editBtn.textContent = '編集を完了';
            editBtn.classList.remove('primary-btn');
            editBtn.classList.add('secondary-btn');
            showToast('時間割のセルをクリックして科目を入力できます');
        } else {
            table.classList.remove('is-editing');
            editBtn.textContent = '時間割を編集';
            editBtn.classList.remove('secondary-btn');
            editBtn.classList.add('primary-btn');
            saveSubjectData(); // 念のため保存
            showToast('時間割を保存しました');
        }
        
        // 全ての subject-name の contenteditable を切り替え
        document.querySelectorAll('.subject-name').forEach(el => {
            el.contentEditable = isEditingSchedule;
        });
    });
    
    document.getElementById('clear-data-btn').addEventListener('click', () => {
        if (confirm('すべての打刻データと時間割をリセットしますか？')) {
            attendanceData = {};
            subjectData = {};
            saveAttendanceData();
            saveSubjectData();
            renderTimetable();
            renderStats();
            showToast('データをリセットしました');
        }
    });
}

// --- QRスキャナー制御 ---
async function startScanner() {
    if (isScanning) return;
    
    const startBtn = document.getElementById('start-scan-btn');
    const stopBtn = document.getElementById('stop-scan-btn');
    const statusMsg = document.getElementById('scan-status');
    
    try {
        html5QrcodeScanner = new Html5Qrcode("reader");
        
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };
        
        await html5QrcodeScanner.start(
            { facingMode: "environment" }, // バックカメラ優先
            config,
            onScanSuccess,
            onScanFailure
        );
        
        isScanning = true;
        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
        statusMsg.textContent = 'スキャン中... QRコードを枠内に映してください。';
        statusMsg.className = 'status-message';
        
    } catch (err) {
        console.error("Camera error:", err);
        showToast('カメラの起動に失敗しました。権限を確認してください。', true);
        statusMsg.textContent = 'カメラのアクセスが拒否されたか、エラーが発生しました。';
    }
}

async function stopScanner() {
    if (!isScanning || !html5QrcodeScanner) return;
    
    const startBtn = document.getElementById('start-scan-btn');
    const stopBtn = document.getElementById('stop-scan-btn');
    const statusMsg = document.getElementById('scan-status');
    
    try {
        await html5QrcodeScanner.stop();
        isScanning = false;
        startBtn.style.display = 'inline-block';
        stopBtn.style.display = 'none';
        statusMsg.textContent = 'カメラを起動してQRを読み取ってください。';
        statusMsg.className = 'status-message';
    } catch (err) {
        console.error("Failed to stop scanner", err);
    }
}

// --- 打刻ロジック ---
// 一定時間連続で同じQRを読まないようにするためのロック
let lastScannedTime = 0; 

function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    // 3秒間は連続スキャンを無視（連続読み取り防止）
    if (now - lastScannedTime < 3000) return;
    lastScannedTime = now;
    
    // スキャン成功時の処理
    processAttendance(new Date(), decodedText);
}

function onScanFailure(error) {
    // 毎フレーム呼ばれるので何もしない
}

function processAttendance(currentDate, qrData) {
    const day = currentDate.getDay();
    
    // 日曜日は授業なしとして処理
    if (day === 0) {
        showToast('今日は日曜日です。', true);
        return;
    }
    
    // 現在の時分を取得して数値化（例: 10:45 -> 1045）
    const h = currentDate.getHours();
    const m = currentDate.getMinutes();
    const currentTimeNum = h * 100 + m;
    
    // 現在時刻がどの時限に該当するか判定
    let targetPeriod = null;
    for (const period of PERIODS) {
        const startParts = period.start.split(':').map(Number);
        const endParts = period.end.split(':').map(Number);
        const startTimeNum = startParts[0] * 100 + startParts[1];
        const endTimeNum = endParts[0] * 100 + endParts[1];
        
        // 授業開始10分前から授業終了までを打刻可能時間とする（要件に応じて調整可）
        // ここでは単純に時間割の枠内に収まっているかで判定
        if (currentTimeNum >= (startTimeNum - 10) && currentTimeNum <= endTimeNum) {
            targetPeriod = period.id;
            break;
        }
    }
    
    const statusMsg = document.getElementById('scan-status');
    
    if (targetPeriod !== null) {
        // 出席処理
        const dateStr = formatDate(currentDate);
        const cellKey = `${dateStr}_${targetPeriod}`;
        
        if (attendanceData[cellKey]) {
            showToast('すでに打刻済みです');
            statusMsg.textContent = `すでに打刻済みです（${targetPeriod}限）`;
            statusMsg.className = 'status-message';
        } else {
            // 新規打刻
            attendanceData[cellKey] = true;
            saveAttendanceData();
            
            // UIを更新（今週を表示している場合のみ）
            if (currentWeekOffset === 0) {
                const cell = document.querySelector(`td[data-key="${cellKey}"]`);
                if (cell) {
                    cell.classList.add('attended');
                }
            }
            
            // 統計情報を更新
            renderStats();
            
            // 通知とバイブレーション（モバイル端末用）
            if (navigator.vibrate) navigator.vibrate(200);
            showToast(`${targetPeriod}限の出席を記録しました！`);
            
            statusMsg.textContent = `打刻成功：${targetPeriod}限`;
            statusMsg.className = 'status-message success';
        }
    } else {
        // 時間外
        showToast('現在は授業時間外です', true);
        statusMsg.textContent = '現在は打刻可能な授業時間外です。';
        statusMsg.className = 'status-message';
    }

    // QRデータがURLの場合は該当ページへ飛ぶ処理
    if (qrData && (qrData.startsWith('http://') || qrData.startsWith('https://'))) {
        showToast('読み取ったページへ移動します...');
        // 少し待ってから画面遷移する（打刻成功の通知を見せるため）
        setTimeout(() => {
            window.location.href = qrData;
        }, 1200);
    }
}

// --- トースト通知 ---
function showToast(message, isError = false) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : ''}`;
    
    // アイコンを追加
    const icon = document.createElement('span');
    icon.textContent = isError ? '⚠️' : '✅';
    toast.appendChild(icon);
    
    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);
    
    container.appendChild(toast);
    
    // 3秒後に消える
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, 3000);
}
