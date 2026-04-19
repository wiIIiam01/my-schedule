// File: src/script/store/ledger.js
import { state, saveData, smartSync } from './app_state.js'; // Nhập smartSync

export const ACTIONS = {
    ADD_RECURRING: 'ADD_RECURRING', UPDATE_RECURRING: 'UPDATE_RECURRING', DELETE_RECURRING: 'DELETE_RECURRING',
    ADD_TASK: 'ADD_TASK', UPDATE_TASK: 'UPDATE_TASK', DELETE_TASK: 'DELETE_TASK', FINISH_TASK: 'FINISH_TASK',
    ADD_TYPE: 'ADD_TYPE', UPDATE_TYPE: 'UPDATE_TYPE', DELETE_TYPE: 'DELETE_TYPE'
};

export let actionLedger = []; 
let syncTimeout = null; // Cờ Debounce

function rootReducer(action) {
    const { type, payload } = action;
    switch (type) {
        case ACTIONS.ADD_RECURRING: state.recurringTasks.push(payload); break;
        case ACTIONS.UPDATE_RECURRING: state.recurringTasks = state.recurringTasks.map(t => t.id === payload.id ? payload : t); break;
        case ACTIONS.DELETE_RECURRING:
            state.recurringTasks = state.recurringTasks.filter(t => t.id !== payload.id);
            if (payload.wipeDiary) state.logs = state.logs.filter(log => log.taskId !== payload.id);
            break;
        case ACTIONS.ADD_TASK: state.tasks.push(payload); break;
        case ACTIONS.UPDATE_TASK: state.tasks = state.tasks.map(t => t.id === payload.id ? payload : t); break;
        case ACTIONS.DELETE_TASK:
            state.tasks = state.tasks.filter(t => t.id !== payload.id);
            if (payload.wipeDiary) state.logs = state.logs.filter(log => log.taskId !== payload.id);
            break;
        case ACTIONS.FINISH_TASK:
            state.logs.push(payload.newLog);
            state.tasks = state.tasks.filter(t => t.id !== payload.taskId);
            break;
        case ACTIONS.ADD_TYPE: state.types.push(payload); break;
        case ACTIONS.UPDATE_TYPE: 
            const typeToUpdate = state.types.find(t => t.id === payload.id);
            if (typeToUpdate) typeToUpdate.customCSS = payload.customCSS;
            break;
        case ACTIONS.DELETE_TYPE:
            state.types = state.types.filter(t => t.id !== payload.typeId);
            state.recurringTasks.forEach(t => { if(t.typeId === payload.typeId) t.typeId = payload.fallbackId; });
            state.tasks.forEach(t => { if(t.typeId === payload.typeId) t.typeId = payload.fallbackId; });
            break;
    }
}

export async function dispatch(type, payload) {
    const action = {
        actionId: 'act_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        timestamp: Date.now(),
        type: type,
        payload: payload
    };

    actionLedger.push(action); 
    rootReducer(action);       
    
    // ĐÓNG DẤU THỜI GIAN MỚI NHẤT
    state.lastModified = Date.now();
    await saveData();          

    console.log(`[DISPATCH]: ${type}`, payload);

    //  KÍCH HOẠT ĐỒNG BỘ THÔNG MINH (Đợi 3 giây sau khi ngừng thao tác)
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        smartSync();
    }, 3000);

    return action;
}