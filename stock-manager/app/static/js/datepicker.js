let pickerState = { 
    inputId: null, 
    year: new Date().getFullYear(), 
    month: new Date().getMonth() + 1, 
    day: new Date().getDate(), 
    scrollOffset: {} 
};
let dateModalCallback = null;

export function initializeDatePicker() {
    initializeWheel('day', 1, getDaysInMonth(pickerState.month, pickerState.year));
    initializeWheel('month', 1, 12);
    initializeWheel('year', new Date().getFullYear() - 5, 2099);
}

function getDaysInMonth(m, y) { return new Date(y, m, 0).getDate(); }

function initializeWheel(type, min, max) {
    const container = document.getElementById(`${type}-items`);
    if (!container) return;
    container.innerHTML = '<div class="wheel-item spacer"></div><div class="wheel-item spacer"></div>';
    for (let i = min; i <= max; i++) {
        const item = document.createElement('div');
        item.className = 'wheel-item'; 
        item.textContent = String(i).padStart(2, '0'); 
        item.dataset.value = i;
        item.onclick = () => { updateWheelPosition(type, i); updateDatePreview(); };
        container.appendChild(item);
    }
    container.innerHTML += '<div class="wheel-item spacer"></div><div class="wheel-item spacer"></div>';
    setupWheelScroller(type);
}

function setupWheelScroller(type) {
    const scroller = document.getElementById(`${type}-wheel`), items = document.getElementById(`${type}-items`);
    if (!scroller || !items) return;
    let startY = 0, currentOffset = 0;
    
    scroller.addEventListener('touchstart', e => { 
        startY = e.touches[0].clientY; 
        currentOffset = pickerState.scrollOffset[type] || 0; 
        items.classList.remove('snapping'); 
    });
    scroller.addEventListener('touchmove', e => { 
        e.preventDefault(); 
        const move = e.touches[0].clientY - startY; 
        updateWheelScroll(type, currentOffset + move); 
    });
    scroller.addEventListener('touchend', () => { 
        items.classList.add('snapping'); 
        snapToNearestValue(type); 
    });
    
    scroller.addEventListener('mousedown', e => {
        startY = e.clientY; 
        currentOffset = pickerState.scrollOffset[type] || 0; 
        items.classList.remove('snapping');
        const move = me => updateWheelScroll(type, currentOffset + (me.clientY - startY));
        const up = () => { 
            document.removeEventListener('mousemove', move); 
            document.removeEventListener('mouseup', up); 
            items.classList.add('snapping'); 
            snapToNearestValue(type); 
        };
        document.addEventListener('mousemove', move); 
        document.addEventListener('mouseup', up);
    });
    
    scroller.addEventListener('wheel', e => { 
        e.preventDefault(); 
        const dir = e.deltaY > 0 ? -1 : 1; 
        const val = pickerState[type] - dir; 
        updateWheelPosition(type, val); 
    }, { passive: false });
}

function updateWheelScroll(type, offset) {
    const items = document.getElementById(`${type}-items`);
    if (!items) return;
    pickerState.scrollOffset[type] = offset;
    items.style.transform = `translateY(${offset}px)`;
}

function snapToNearestValue(type) {
    const items = document.getElementById(`${type}-items`);
    if (!items) return;
    const children = items.querySelectorAll('.wheel-item:not(.spacer)');
    let bestChild = children[0], bestDist = Infinity;
    children.forEach(child => {
        const dist = Math.abs(pickerState.scrollOffset[type] - (64 - Array.from(items.children).indexOf(child) * 32));
        if (dist < bestDist) { bestDist = dist; bestChild = child; }
    });
    updateWheelPosition(type, parseInt(bestChild.dataset.value));
}

export function updateWheelPosition(type, val) {
    const items = document.getElementById(`${type}-items`);
    if (!items) return;
    const children = Array.from(items.children);
    const idx = children.findIndex(c => c.dataset.value == val);
    if (idx === -1) return;
    const offset = 64 - idx * 32; updateWheelScroll(type, offset);
    children.forEach((c, i) => c.classList.toggle('active', i === idx));
    pickerState[type] = val;
    if (type !== 'day') {
        const max = getDaysInMonth(pickerState.month, pickerState.year);
        const currentDays = document.getElementById('day-items')?.querySelectorAll('.wheel-item:not(.spacer)').length;
        if (currentDays !== max) {
            initializeWheel('day', 1, max); 
            if (pickerState.day > max) pickerState.day = max; 
            updateWheelPosition('day', pickerState.day);
        }
    }
    updateDatePreview();
}

function updateDatePreview() { 
    const el = document.getElementById('date-preview');
    if (el) el.textContent = `${String(pickerState.day).padStart(2, '0')} / ${String(pickerState.month).padStart(2, '0')} / ${pickerState.year}`; 
}

export function openDatePicker(id) {
    const input = document.getElementById(id); 
    pickerState.inputId = id;
    if (input && input.value) { 
        const [y, m, d] = input.value.split('-').map(Number); 
        pickerState.year = y; pickerState.month = m; pickerState.day = d; 
    }
    updateWheelPosition('day', pickerState.day); 
    updateWheelPosition('month', pickerState.month); 
    updateWheelPosition('year', pickerState.year);
    document.getElementById('date-picker-modal').classList.add('show');
}

export function closeDatePicker() { 
    document.getElementById('date-picker-modal').classList.remove('show'); 
    pickerState.inputId = null; 
}

export function confirmDatePicker() {
    const date = `${pickerState.year}-${String(pickerState.month).padStart(2, '0')}-${String(pickerState.day).padStart(2, '0')}`;
    if (pickerState.inputId === '__modal__') { 
        const cb = dateModalCallback; 
        closeDatePicker(); 
        if (cb) cb(date); 
    }
    else {
        const input = document.getElementById(pickerState.inputId);
        if (input) { 
            input.value = date; 
            input.dispatchEvent(new Event('change', { bubbles: true })); 
        }
        closeDatePicker();
    }
}

export function openDateModal(callback) {
    dateModalCallback = callback;
    const today = new Date();
    pickerState.year = today.getFullYear();
    pickerState.month = today.getMonth() + 1;
    pickerState.day = today.getDate();
    pickerState.inputId = '__modal__';
    updateWheelPosition('day', pickerState.day);
    updateWheelPosition('month', pickerState.month);
    updateWheelPosition('year', pickerState.year);
    updateDatePreview();
    document.getElementById('date-picker-modal').classList.add('show');
}

export function wrapDateInputsWithPicker() {
    document.querySelectorAll('input[type="date"]').forEach(input => {
        if (input.parentElement.classList.contains('date-input-wrapper')) return;
        const wrapper = document.createElement('div'); wrapper.className = 'date-input-wrapper';
        const btn = document.createElement('button'); btn.className = 'date-display-btn'; btn.type = 'button';
        btn.textContent = input.value || 'Hoy'; 
        btn.onclick = () => openDatePicker(input.id);
        input.style.display = 'none'; 
        if (!input.id) input.id = 'date-' + Math.random().toString(36).substr(2, 9);
        input.addEventListener('change', () => btn.textContent = input.value || 'Hoy');
        input.parentElement.insertBefore(wrapper, input); 
        wrapper.appendChild(btn); 
        wrapper.appendChild(input);
    });
}
