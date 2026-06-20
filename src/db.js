import { createClient } from '@supabase/supabase-js'

// 부모님께서 알려주신 Supabase 프로젝트 정보
const supabaseUrl = 'https://cffosiozfhadpjvgljgj.supabase.co';
const supabaseAnonKey = 'sb_publishable_-Ug7RWjsZSvfmW32UBft8w_RbuDZcZZ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ==========================================
// [로컬 폴백 DB] Supabase 연동 전이거나 실패 시 사용할 테스트용
// ==========================================
const defaultDb = {
    profiles: {
        yoonseo: { name: "윤서", grade: "고2", schoolCode: "7531379", money: 0, coupons: 0, accumulatedExtraMinutes: 0, lastStudyDate: "", todayStudiedMinutes: 0, targetWeekday: 120, targetWeekend: 60, targetVacation: 120 },
        yeonwoo: { name: "연우", grade: "중1", schoolCode: "7751044", money: 0, coupons: 0, accumulatedExtraMinutes: 0, lastStudyDate: "", todayStudiedMinutes: 0, targetWeekday: 120, targetWeekend: 60, targetVacation: 120 },
        yeontaek: { name: "연택", grade: "초4", schoolCode: "7751123", money: 0, coupons: 0, accumulatedExtraMinutes: 0, lastStudyDate: "", todayStudiedMinutes: 0, targetWeekday: 120, targetWeekend: 60, targetVacation: 120 }
    },
    transactions: [],
    todos: [],
    customEvents: [],
    holidaysCache: {}
};

let localDb = JSON.parse(localStorage.getItem('studyTracker_react_db'));
if (!localDb) {
    localDb = defaultDb;
    localStorage.setItem('studyTracker_react_db', JSON.stringify(localDb));
}
function saveLocal() { localStorage.setItem('studyTracker_react_db', JSON.stringify(localDb)); }

// DB API 래퍼
export const api = {
    async getProfile(userId) {
        if (supabase) {
            const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
            if (data) return { ...localDb.profiles[userId], ...data, name: localDb.profiles[userId].name, grade: localDb.profiles[userId].grade, schoolCode: localDb.profiles[userId].schoolCode };
        }
        return localDb.profiles[userId];
    },
    async updateProfile(userId, updates) {
        if (supabase) {
            await supabase.from('profiles').update({
                money: updates.money, coupons: updates.coupons, 
                accumulated_extra_minutes: updates.accumulatedExtraMinutes,
                today_studied_minutes: updates.todayStudiedMinutes,
                last_study_date: updates.lastStudyDate,
                target_weekday: updates.targetWeekday,
                target_weekend: updates.targetWeekend,
                target_vacation: updates.targetVacation
            }).eq('id', userId);
        }
        localDb.profiles[userId] = { ...localDb.profiles[userId], ...updates };
        saveLocal();
    },
    async getTransactions(userId = null) {
        if (supabase) {
            let q = supabase.from('transactions').select('*').order('created_at', { ascending: false });
            if (userId) q = q.eq('user_id', userId);
            const { data } = await q;
            if (data && data.length > 0) {
                return data.map(t => ({ id: t.id, userId: t.user_id, date: t.date_str, title: t.title, amount: t.amount, coupons: t.coupons, isDeduct: t.is_deduct }));
            }
        }
        if (userId) return localDb.transactions.filter(t => t.userId === userId).sort((a,b)=>b.id-a.id);
        return localDb.transactions.sort((a,b)=>b.id-a.id);
    },
    async addTransaction(tx) {
        const dateStr = new Date().toLocaleString('ko-KR');
        if (supabase) {
            await supabase.from('transactions').insert([{ user_id: tx.userId, date_str: dateStr, title: tx.title, amount: tx.amount, coupons: tx.coupons, is_deduct: tx.isDeduct }]);
        }
        localDb.transactions.unshift({ id: Date.now(), date: dateStr, ...tx });
        saveLocal();
    },
    async getTodos(userId, dateString) {
        if (supabase) {
            const { data } = await supabase.from('todos').select('*').eq('user_id', userId).eq('date_str', dateString);
            if (data && data.length > 0) return data.map(d => ({ id: d.id, userId: d.user_id, date: d.date_str, task_text: d.task_text, is_completed: d.is_completed }));
        }
        return localDb.todos.filter(t => t.userId === userId && t.date === dateString);
    },
    async addTodo(todo) {
        if (supabase) {
            const { data } = await supabase.from('todos').insert([{ user_id: todo.userId, date_str: todo.date, task_text: todo.task_text }]).select().single();
            if (data) return { id: data.id, userId: data.user_id, date: data.date_str, task_text: data.task_text, is_completed: data.is_completed };
        }
        const newTodo = { id: Date.now(), is_completed: false, ...todo };
        localDb.todos.push(newTodo);
        saveLocal();
        return newTodo;
    },
    async toggleTodo(id) {
        if (supabase) {
            const { data } = await supabase.from('todos').select('is_completed').eq('id', id).single();
            if (data) await supabase.from('todos').update({ is_completed: !data.is_completed }).eq('id', id);
        }
        const t = localDb.todos.find(x => x.id === id);
        if (t) t.is_completed = !t.is_completed;
        saveLocal();
    },
    async deleteTodo(id) {
        if (supabase) {
            await supabase.from('todos').delete().eq('id', id);
        }
        localDb.todos = localDb.todos.filter(x => x.id !== id);
        saveLocal();
    },
    async getHolidayInfo(schoolCode, neisDateStr, isWeekend) {
        if (isWeekend) return { isHoliday: true, isVacation: false };
        const cacheKey = `${neisDateStr}-${schoolCode}`;
        if (localDb.holidaysCache[cacheKey]) return localDb.holidaysCache[cacheKey];

        try {
            const url = `https://open.neis.go.kr/hub/SchoolSchedule?Type=json&ATPT_OFCDC_SC_CODE=J10&SD_SCHUL_CODE=${schoolCode}&AA_YMD=${neisDateStr}`;
            const res = await fetch(url);
            const data = await res.json();
            let result = { isHoliday: false, isVacation: false };
            if (data.SchoolSchedule?.[1]?.row) {
                const sbtr = data.SchoolSchedule[1].row[0].SBTR_DD_SC_NM; 
                if (sbtr === '방학') { result.isHoliday = true; result.isVacation = true; } 
                else if (sbtr && sbtr !== '해당없음') { result.isHoliday = true; }
            }
            localDb.holidaysCache[cacheKey] = result;
            saveLocal();
            return result;
        } catch (e) {
            return { isHoliday: false, isVacation: false };
        }
    },
    async getMonthSchedule(schoolCode, yyyymm) {
        try {
            const url = `https://open.neis.go.kr/hub/SchoolSchedule?Type=json&ATPT_OFCDC_SC_CODE=J10&SD_SCHUL_CODE=${schoolCode}&AA_YMD=${yyyymm}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.SchoolSchedule?.[1]?.row) return data.SchoolSchedule[1].row;
            return [];
        } catch (e) { return []; }
    },
    async getCustomEvents(userId, yyyymm) {
        // userId가 'admin'이면 전체 일정을 가져온다고 가정
        if (supabase) {
            let q = supabase.from('custom_events').select('*').like('date_str', `${yyyymm}%`);
            if (userId !== 'admin') {
                q = q.or(`user_id.eq.${userId},user_id.is.null`);
            }
            const { data } = await q;
            if (data) return data;
        }
        if (userId !== 'admin') {
            return localDb.customEvents.filter(e => e.date_str.startsWith(yyyymm) && (!e.user_id || e.user_id === userId));
        }
        return localDb.customEvents.filter(e => e.date_str.startsWith(yyyymm));
    },
    async addCustomEvent(userId, dateStr, eventText) {
        if (supabase) {
            await supabase.from('custom_events').insert([{ user_id: userId, date_str: dateStr, event_text: eventText }]);
        }
        localDb.customEvents.push({ id: Date.now(), user_id: userId, date_str: dateStr, event_text: eventText });
        saveLocal();
    }
};
