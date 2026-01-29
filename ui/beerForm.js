import { STYLE_SPECS, CALORIES, SIZE_DATA, STYLE_METADATA, APP } from '../constants.js';
import { Calc } from '../logic.js';
import { db } from '../store.js';
import { showMessage, Feedback } from './dom.js';
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export const getBeerFormData = () => {
    const dateVal = document.getElementById('beer-date').value;

    // 未来日付チェック
    if (dateVal && dayjs(dateVal).isAfter(dayjs(), 'day')) {
        showMessage('未来の日付は選択できません', 'error');
        throw new Error('Future date selected');
    }

    const brewery = document.getElementById('beer-brewery').value;
    const brand = document.getElementById('beer-brand').value;
    const rating = parseInt(document.getElementById('beer-rating').value) || 0;
    const memo = document.getElementById('beer-memo').value;
    const untappdCheck = document.getElementById('untappd-check');
    const useUntappd = untappdCheck ? untappdCheck.checked : false;

    // ▼▼▼ 修正箇所: タイムスタンプの計算ロジック ▼▼▼
    const now = dayjs();
    const inputDate = dateVal ? dayjs(dateVal) : now;
    
    // 入力された日付が「今日」と同じなら、現在の時刻(Date.now())を使用する
    // それ以外（過去分）なら、従来通り12:00（正午）とする
    const ts = inputDate.isSame(now, 'day')
        ? Date.now()
        : inputDate.startOf('day').add(12, 'hour').valueOf();
    // ▲▲▲ 修正ここまで ▲▲▲
    
    const isCustom = !document.getElementById('beer-input-custom').classList.contains('hidden');
    
    const styleSel = document.getElementById('beer-select');
    const style = styleSel.options[styleSel.selectedIndex]?.value || '国産ピルスナー';
    
    const sizeSel = document.getElementById('beer-size');
    const size = sizeSel.options[sizeSel.selectedIndex]?.value || '350';
    
    // ★ let に変更（再代入を可能にするため）
    let count = parseInt(document.getElementById('beer-count').value) || 1;
    if (count <= 0) count = 1; 
    
    // ★ プリセット選択時の ABV 補正値を取得
    const presetAbvInput = document.getElementById('preset-abv');
    const userAbv = presetAbvInput ? parseFloat(presetAbvInput.value) : NaN;

    // ★ let に変更 & カスタム入力のバリデーション
    let customAbv = Math.abs(parseFloat(document.getElementById('custom-abv').value) || 5.0);
    if (customAbv > 100) customAbv = 100;

    let customMl = Math.abs(parseInt(document.getElementById('custom-amount').value) || 350);
    if (customMl <= 0) customMl = 350;

    // --- 糖質タイプ/数値の特定（ここを整理しました） ---
    let type = 'sweet';
    let carb = 3.0;

    if (isCustom) {
        const typeEl = document.querySelector('input[name="customType"]:checked');
        type = typeEl ? typeEl.value : 'sweet';
        carb = (type === 'dry') ? 0.0 : 3.0; // カスタムのDryなら糖質0
    } else {
        const spec = STYLE_SPECS[style] || { carb: 3.5 };
        carb = spec.carb;
        type = (carb <= 0.5) ? 'dry' : 'sweet'; // carbが極端に少なければdry扱い
    }

    return {
        timestamp: ts,
        brewery, brand, rating, memo,
        style, size, count,
        isCustom,
        userAbv, // プリセット時の補正度数
        abv: customAbv, // カスタム時の度数
        ml: customMl,
        carb: carb,
        type: type, // sweet または dry
        useUntappd
    };
};

/**
 * ビールモーダルの入力内容から推定カロリーをリアルタイム表示する
 */

export const updateBeerKcalPreview = () => {
    const previewEl = document.getElementById('beer-kcal-preview');
    if (!previewEl) return;

    try {
        const isCustom = !document.getElementById('beer-input-custom').classList.contains('hidden');
        const count = parseInt(document.getElementById('beer-count').value) || 1;

        // ▼▼▼ 修正点1: ここでまとめて宣言（const sizeMl... の行は削除しました） ▼▼▼
        let abv, carb, sizeMl;

        if (isCustom) {
            // カスタムタブ: custom-amount から取得
            sizeMl = parseInt(document.getElementById('custom-amount').value) || 350;
            
            abv = parseFloat(document.getElementById('custom-abv').value) || 5.0;
            const typeEl = document.querySelector('input[name="customType"]:checked');
            const type = typeEl ? typeEl.value : 'sweet';
            carb = (type === 'dry') ? 0.0 : 3.0;
        } else {
            // プリセットタブ: beer-size から取得
            sizeMl = parseInt(document.getElementById('beer-size').value) || 0;
            
            const styleKey = document.getElementById('beer-select').value;
            const spec = STYLE_SPECS[styleKey] || { abv: 5.0, carb: 3.5 };
            const userAbvInput = document.getElementById('preset-abv').value;
            abv = (userAbvInput !== "") ? parseFloat(userAbvInput) : spec.abv;
            carb = spec.carb;
        }

        // カロリー計算
        const kcal = Math.abs(Calc.calculateBeerDebit(sizeMl, abv, carb, count));
        previewEl.innerHTML = `${Math.round(kcal)} <span class="text-[10px] font-bold ml-1 text-gray-400">kcal</span>`;
    } catch (e) {
        console.error(e); // エラーが見えるようにログに出力
    }
};

/**
 * 3. 本数調整（ボタン用）修正版
 */
export const adjustBeerCount = (delta) => {

    // ★追加: ダイヤルを回すような「コリッ」とした感触
    Feedback.uiDial();

    const el = document.getElementById('beer-count');
    if (!el) return;

    let val = parseInt(el.value);
    if (isNaN(val)) val = 1;

    // 1未満にはならないように制限
    val = Math.max(1, val + delta);
    el.value = val;

    // ★ここが重要：数値を書き換えたら手動でプレビューを更新する
    if (typeof updateBeerKcalPreview === 'function') {
        updateBeerKcalPreview();
    }

    // 元のコードにあった振動フィードバックも維持
     // ★修正：Feedbackが存在するかチェックしてから、tap() を呼ぶ
    if (typeof Feedback !== 'undefined') {
        if (Feedback.tap) Feedback.tap(); // 音を鳴らす
        if (Feedback.haptic) Feedback.haptic.light(); // 振動させる
    }
};

export const switchBeerInputTab = (mode) => {
    const preset = document.getElementById('beer-input-preset');
    const custom = document.getElementById('beer-input-custom');
    const btnPreset = document.getElementById('tab-beer-preset');
    const btnCustom = document.getElementById('tab-beer-custom');
    
    const activeClasses = ['bg-indigo-600', 'text-white', 'shadow-sm'];
    const inactiveClasses = ['text-gray-500', 'hover:bg-base-200', 'dark:hover:bg-base-800'];

    if (mode === 'preset') {
        preset.classList.remove('hidden'); custom.classList.add('hidden');
        btnPreset.classList.remove(...inactiveClasses); btnPreset.classList.add(...activeClasses);
        btnCustom.classList.remove(...activeClasses); btnCustom.classList.add(...inactiveClasses);
    } else {
        preset.classList.add('hidden'); custom.classList.remove('hidden');
        btnPreset.classList.remove(...activeClasses); btnPreset.classList.add(...inactiveClasses);
        btnCustom.classList.remove(...inactiveClasses); btnCustom.classList.add(...activeClasses);
    }
    updateBeerKcalPreview();
};

export const resetBeerForm = (keepDate = false) => {
    if (!keepDate) document.getElementById('beer-date').value = dayjs().format('YYYY-MM-DD');
    
    const idField = document.getElementById('editing-log-id');
    if(idField) idField.value = '';
    
    document.getElementById('beer-count').value = 1;
    document.getElementById('beer-brewery').value = '';
    document.getElementById('beer-brand').value = '';
    document.getElementById('beer-rating').value = '0';
    document.getElementById('beer-memo').value = '';
    
    // ★ 度数補正フィールドもリセット
    const presetAbv = document.getElementById('preset-abv');
    if(presetAbv) presetAbv.value = '';
    
    const untappdCheck = document.getElementById('untappd-check');
    if(untappdCheck) untappdCheck.checked = false;
    
    switchBeerInputTab('preset');
};

export const searchUntappd = () => {
    const brewery = document.getElementById('beer-brewery').value;
    const brand = document.getElementById('beer-brand').value;
    if (!brand) { 
        showMessage('検索するにはビール名を入力してください', 'error'); 
        return; 
    }
    const query = encodeURIComponent(`${brewery} ${brand}`.trim());
    window.open(`https://untappd.com/search?q=${query}`, '_blank');
};

export const updateBeerSelectOptions = () => {
    const styleSel = document.getElementById('beer-select');
    const sizeSel = document.getElementById('beer-size');
    
    if (styleSel && styleSel.children.length === 0) {
        const source = (typeof STYLE_METADATA !== 'undefined') ? STYLE_METADATA : CALORIES.STYLES;
        const styles = Object.keys(source || {});
        
        styles.forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = key;
            styleSel.appendChild(opt);
        });
        if (APP.DEFAULTS.MODE1) styleSel.value = APP.DEFAULTS.MODE1;
    }

    if (sizeSel && sizeSel.children.length === 0) {
        Object.entries(SIZE_DATA).forEach(([key, val]) => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = val.label;
            sizeSel.appendChild(opt);
        });
        sizeSel.value = '350'; 
    }
};

export const updateInputSuggestions = async () => {
    try {
        // DBからビール記録だけを取得（非同期）
        const logs = await db.logs.where('type').equals('beer').toArray();
        
        // 重複を除外してリスト化
        // Setを使うことで、同じ銘柄が何度あっても1つにまとめられます
        const breweries = [...new Set(logs.map(l => l.brewery).filter(b => b))].sort();
        const brands = [...new Set(logs.map(l => l.brand || l.name).filter(b => b))].sort();

        // datalistの中身を更新するヘルパー関数
        const updateList = (id, items) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerHTML = ''; // クリア
            
            // 最大50件程度に制限（多すぎると重くなるため）
            // 最近使った順にソートするロジックを入れても良いですが、まずは辞書順で
            items.slice(0, 100).forEach(item => {
                const opt = document.createElement('option');
                opt.value = item;
                el.appendChild(opt);
            });
        };

        updateList('brewery-list', breweries);
        updateList('brand-list', brands);
        
    } catch (e) {
        console.error("Failed to update suggestions:", e);
    }
};




