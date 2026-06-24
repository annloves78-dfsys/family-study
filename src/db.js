import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://cffosiozfhadpjvgljgj.supabase.co';
const supabaseAnonKey = 'sb_publishable_-Ug7RWjsZSvfmW32UBft8w_RbuDZcZZ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ==========================================
// [로컬 폴백 DB] 
// ==========================================
const defaultDb = {
    profiles: {
        yoonseo: { id: "yoonseo", name: "윤서", password: "0000", is_password_set: false, role: "child" },
        yeonwoo: { id: "yeonwoo", name: "연우", password: "0000", is_password_set: false, role: "child" },
        yeontaek: { id: "yeontaek", name: "연택", password: "0000", is_password_set: false, role: "child" },
        admin: { id: "admin", name: "관리자", password: "1234", is_password_set: false, role: "admin" }
    },
    daily_targets: [],
    study_stamps: []
};

let localDb = JSON.parse(localStorage.getItem('studyTracker_react_db_v2'));
if (!localDb) {
    localDb = defaultDb;
    localStorage.setItem('studyTracker_react_db_v2', JSON.stringify(localDb));
}
function saveLocal() { localStorage.setItem('studyTracker_react_db_v2', JSON.stringify(localDb)); }

export const api = {
    async getProfile(userId) {
        if (supabase) {
            const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
            if (data) return data;
        }
        return localDb.profiles[userId];
    },
    async checkPassword(userId, password) {
        const p = await this.getProfile(userId);
        return p && p.password === password;
    },
    async setPassword(userId, newPassword) {
        if (supabase) {
            await supabase.from('profiles').update({ password: newPassword, is_password_set: true }).eq('id', userId);
        }
        const p = localDb.profiles[userId];
        if (p) {
            p.password = newPassword;
            p.is_password_set = true;
            saveLocal();
        }
    },
    async getTargets(userId, startDateStr, endDateStr) {
        if (supabase) {
            const { data } = await supabase.from('daily_targets')
                .select('*')
                .eq('user_id', userId)
                .gte('date_str', startDateStr)
                .lte('date_str', endDateStr);
            if (data) return data;
        }
        return localDb.daily_targets.filter(t => t.user_id === userId && t.date_str >= startDateStr && t.date_str <= endDateStr);
    },
    async setTarget(userId, dateStr, count) {
        if (supabase) {
            const { data: existing } = await supabase.from('daily_targets').select('id').eq('user_id', userId).eq('date_str', dateStr).single();
            if (existing) {
                await supabase.from('daily_targets').update({ target_count: count }).eq('id', existing.id);
            } else {
                await supabase.from('daily_targets').insert([{ user_id: userId, date_str: dateStr, target_count: count }]);
            }
        } else {
            const t = localDb.daily_targets.find(x => x.user_id === userId && x.date_str === dateStr);
            if (t) t.target_count = count;
            else localDb.daily_targets.push({ id: Date.now(), user_id: userId, date_str: dateStr, target_count: count });
            saveLocal();
        }
    },
    async setTargetAll(userIds, dateStr, count) {
        for (const uid of userIds) {
            await this.setTarget(uid, dateStr, count);
        }
    },
    async getStamps(userId) {
        if (supabase) {
            const { data } = await supabase.from('study_stamps').select('*').eq('user_id', userId);
            if (data) return data;
        }
        return localDb.study_stamps.filter(s => s.user_id === userId);
    },
    async toggleStamp(userId, dateStr, stampIndex) {
        if (supabase) {
            const { data: existing } = await supabase.from('study_stamps')
                .select('id')
                .eq('user_id', userId)
                .eq('date_str', dateStr)
                .eq('stamp_index', stampIndex)
                .single();
            if (existing) {
                await supabase.from('study_stamps').delete().eq('id', existing.id);
            } else {
                await supabase.from('study_stamps').insert([{ user_id: userId, date_str: dateStr, stamp_index: stampIndex }]);
            }
        } else {
            const idx = localDb.study_stamps.findIndex(x => x.user_id === userId && x.date_str === dateStr && x.stamp_index === stampIndex);
            if (idx >= 0) localDb.study_stamps.splice(idx, 1);
            else localDb.study_stamps.push({ id: Date.now(), user_id: userId, date_str: dateStr, stamp_index: stampIndex });
            saveLocal();
        }
    },
    async getStats(userId) {
        // 돈과 쿠폰 계산
        const stamps = await this.getStamps(userId);
        const totalMoney = stamps.length * 500;

        let totalCoupons = 0;
        // 날짜별 도장 개수 집계
        const dailyStamps = {};
        stamps.forEach(s => {
            dailyStamps[s.date_str] = (dailyStamps[s.date_str] || 0) + 1;
        });

        // 모든 날짜의 타겟 가져오기 (전체 기간)
        // 실제로는 stamps가 있는 날짜들에 대해서만 확인해도 됨
        if (supabase) {
            const { data: targets } = await supabase.from('daily_targets').select('*').eq('user_id', userId);
            const targetMap = {};
            if (targets) {
                targets.forEach(t => targetMap[t.date_str] = t.target_count);
            }
            
            for (const [date, count] of Object.entries(dailyStamps)) {
                const target = targetMap[date] || 0;
                if (count > target && target > 0) { // 목표가 0일 때는 쿠폰이 안 쌓이도록 방어 (또는 쌓이게 할수도 있음. 기획상 '공부해야하는 시간까지 찍어놓으면 그 이후 공부한건 쿠폰'이라고 함)
                    totalCoupons += (count - target);
                }
            }
        } else {
            for (const [date, count] of Object.entries(dailyStamps)) {
                const t = localDb.daily_targets.find(x => x.user_id === userId && x.date_str === date);
                const target = t ? t.target_count : 0;
                if (count > target && target > 0) {
                    totalCoupons += (count - target);
                }
            }
        }

        return { money: totalMoney, coupons: totalCoupons, stamps };
    }
};
