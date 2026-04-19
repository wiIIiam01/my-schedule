/**
 * Hàm xử lý Auto Diary hoàn toàn độc lập.
 * @param {Array} currentTasks - Danh sách task hiện tại
 * @param {Array} currentLogs - Danh sách log hiện hành
 * @param {String} lastLoggedDate - Ngày lưu log cuối cùng (YYYY-MM-DD)
 * @returns {Object} - Kết quả tính toán { hasChanges, newLogs, newLastLoggedDate }
 */
export function processAutoDiary(currentTasks, currentLogs, lastLoggedDate) {
    const getLocalDateString = (d) => {
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const now = new Date();
    const todayStr = getLocalDateString(now);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let newLogs = [...(currentLogs || [])];
    let dataChanged = false;
    let newLastLoggedDate = lastLoggedDate;

    // 1. Khởi tạo mốc nếu lần đầu mở app
    if (!newLastLoggedDate) {
        return {
            hasChanges: true,
            newLogs: newLogs,
            newLastLoggedDate: todayStr
        };
    }

    // 2. Bắt đầu quét từ ngày cuối cùng mở app đến ngày hôm nay
    let checkDate = new Date(newLastLoggedDate);
    checkDate.setHours(0, 0, 0, 0); 
    
    const todayReset = new Date(now);
    todayReset.setHours(0, 0, 0, 0);

    while (checkDate <= todayReset) {
        let dayOfWeek = checkDate.getDay();
        let dateString = getLocalDateString(checkDate);
        
        let tasksForDay = currentTasks.filter(t => t.days && t.days.includes(dayOfWeek));

        tasksForDay.forEach(t => {
            const isLogged = newLogs.some(log => log.date === dateString && log.taskId === t.id);
            
            if (!isLogged) {
                let shouldLog = false;

                if (checkDate < todayReset) {
                    shouldLog = true;
                } else if (checkDate.getTime() === todayReset.getTime()) {
                    if (t.start) {
                        const [h, m] = t.start.split(':').map(Number);
                        const taskStartMinutes = h * 60 + m;
                        if (currentMinutes >= taskStartMinutes) {
                            shouldLog = true;
                        }
                    }
                }

                if (shouldLog) {
                    newLogs.push({
                        logId: `diary_${dateString}_${t.id}`,
                        date: dateString,
                        taskId: t.id,
                        title: t.title,
                        start: t.start,
                        end: t.end,
                        typeId: t.typeId,
                        updatedAt: Date.now()
                    });
                    dataChanged = true;
                }
            }
        });

        checkDate.setDate(checkDate.getDate() + 1);
    }

    if (newLastLoggedDate !== todayStr) {
        newLastLoggedDate = todayStr;
        dataChanged = true;
    }

    return {
        hasChanges: dataChanged,
        newLogs: newLogs,
        newLastLoggedDate: newLastLoggedDate
    };
}