/* 
   Recipes & Diet Planner Logic
   v0.6.5
*/

window.plannerCharts = { kcal: null };
window.plannerActiveDate = new Date().toLocaleDateString('sv').split(' ')[0]; // YYYY-MM-DD local

window.loadRecipes = async () => {
    try {
        window.recipes = await window.apiCall('/recipes');
        window.updateRecipeList();
    } catch (e) { console.error('Error loading recipes:', e); }
};

window.updateRecipeList = () => {
    const container = document.getElementById('recipe-list'); if (!container) return;
    const query = window.normalizeText(document.getElementById('recipe-search')?.value || '');
    const filtered = (window.recipes || []).filter(r => window.normalizeText(r.name).includes(query));
    if (filtered.length === 0) { container.innerHTML = '<div class="empty-state">No hay recetas que coincidan</div>'; return; }
    container.innerHTML = filtered.map(r => `
        <div class="recipe-card">
            <div class="recipe-img"><img src="${r.image_url || 'https://placehold.co/400x200/111/444?text=' + encodeURIComponent(r.name)}" onerror="this.src='https://placehold.co/400x200/111/444?text=Receta'"></div>
            <div class="recipe-info">
                <div class="recipe-title">${r.name}</div>
                <div class="recipe-meta"><span>🔥 ${Math.round(r.kcal)} kcal</span><span>🥩 ${Math.round(r.proteins)}g</span><span>🥣 ${r.servings} raciones</span></div>
                <div style="display:flex; gap:8px; margin-top:12px;"><button class="btn btn-primary" style="flex:1; font-size:12px;" onclick="window.consumeRecipe(${r.id})">Consumir</button><button class="btn btn-secondary" style="width:40px;" onclick="window.openRecipeEditor(${r.id})">✏️</button><button class="btn btn-del" onclick="window.deleteRecipe(${r.id})">✕</button></div>
            </div>
        </div>`).join('');
};

window.openRecipeEditor = (id = null) => {
    const title = document.getElementById('recipe-editor-title');
    const nameInput = document.getElementById('recipe-name-input');
    const instrInput = document.getElementById('recipe-instructions-input');
    const servingsInput = document.getElementById('recipe-servings-input');
    const imageInput = document.getElementById('recipe-image-input');
    window.currentRecipeEditorIngredients = [];
    if (id) {
        const r = (window.recipes || []).find(rec => rec.id === id);
        if (title) title.innerText = 'Editar Receta'; if (nameInput) nameInput.value = r.name; if (instrInput) instrInput.value = r.instructions || ''; if (servingsInput) servingsInput.value = r.servings; if (imageInput) imageInput.value = r.image_url || '';
        window.currentRecipeEditorIngredients = r.ingredients.map(ing => ({ product_barcode: ing.product_barcode, custom_name: ing.custom_name, quantity: ing.quantity, unit: ing.unit }));
        if (nameInput) nameInput.dataset.editId = id;
    } else {
        if (title) title.innerText = 'Nueva Receta'; if (nameInput) nameInput.value = ''; if (instrInput) instrInput.value = ''; if (servingsInput) servingsInput.value = 1; if (imageInput) imageInput.value = '';
        if (nameInput) delete nameInput.dataset.editId;
    }
    renderEditorIngredients();
    document.getElementById('recipe-editor-panel')?.classList.add('active');
};

window.closeRecipeEditor = () => { document.getElementById('recipe-editor-panel')?.classList.remove('active'); };

function renderEditorIngredients() {
    const list = document.getElementById('recipe-ingredients-list'); if (!list) return;
    list.innerHTML = window.currentRecipeEditorIngredients.map((ing, i) => {
        const p = ing.product_barcode ? window.products.find(prod => prod.barcode === ing.product_barcode) : null;
        const name = ing.custom_name || p?.name || 'Producto';
        return `
        <div class="ingredient-item">
            <div style="display:flex; flex-direction:column;">
                <span style="font-weight:600;">${name}</span>
                ${p ? `<small style="color:var(--text-dim); font-size:10px;">Stock: ${p.stock}${p.unit_type}</small>` : ''}
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <b>${ing.quantity} ${ing.unit}</b>
                <button class="btn-del" onclick="window.removeIngFromEditor(${i})">✕</button>
            </div>
        </div>`;
    }).join('');
    updateRecipeMacrosPreview();
}

window.removeIngFromEditor = (i) => { window.currentRecipeEditorIngredients.splice(i, 1); renderEditorIngredients(); };

window.saveRecipe = async () => {
    const editId = document.getElementById('recipe-name-input').dataset.editId;
    const name = document.getElementById('recipe-name-input').value;
    if (!name) { window.showToast('El nombre es obligatorio', 'error'); return; }
    
    const recipeData = {
        name: name, description: "", instructions: document.getElementById('recipe-instructions-input').value, servings: parseInt(document.getElementById('recipe-servings-input').value), image_url: document.getElementById('recipe-image-input').value, ingredients: window.currentRecipeEditorIngredients,
        kcal: parseFloat(document.getElementById('prev-recipe-kcal').innerText), proteins: parseFloat(document.getElementById('prev-recipe-proteins').innerText.replace('g', '')), carbs: parseFloat(document.getElementById('prev-recipe-carbs').innerText.replace('g', '')), fat: parseFloat(document.getElementById('prev-recipe-fat').innerText.replace('g', ''))
    };
    try {
        if (editId) await window.apiCall(`/recipes/${editId}`, 'DELETE');
        await window.apiCall('/recipes', 'POST', recipeData); window.showToast('Receta guardada', 'success'); window.closeRecipeEditor(); window.loadRecipes();
    } catch (e) { window.showToast('Error: ' + e.message, 'error'); }
};

function updateRecipeMacrosPreview() {
    let totals = { kcal: 0, proteins: 0, carbs: 0, fat: 0 };
    const servings = parseFloat(document.getElementById('recipe-servings-input').value) || 1;
    window.currentRecipeEditorIngredients.forEach(ing => {
        if (ing.product_barcode) {
            const p = window.products.find(prod => prod.barcode === ing.product_barcode);
            if (p && p.kcal_100g) {
                let weight = (ing.unit === 'g' || ing.unit === 'ml') ? ing.quantity : (p.serving_size ? ing.quantity * p.serving_size : 0);
                totals.kcal += (p.kcal_100g/100)*weight; totals.proteins += (p.proteins_100g/100)*weight; totals.carbs += (p.carbs_100g/100)*weight; totals.fat += (p.fat_100g/100)*weight;
            }
        }
    });
    const pk = document.getElementById('prev-recipe-kcal'); if (pk) pk.innerText = Math.round(totals.kcal/servings);
    const pp = document.getElementById('prev-recipe-proteins'); if (pp) pp.innerText = Math.round(totals.proteins/servings) + 'g';
    const pc = document.getElementById('prev-recipe-carbs'); if (pc) pc.innerText = Math.round(totals.carbs/servings) + 'g';
    const pf = document.getElementById('prev-recipe-fat'); if (pf) pf.innerText = Math.round(totals.fat/servings) + 'g';
}

window.loadPlanner = async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (!window.plannerActiveDate) window.plannerActiveDate = todayStr;
    
    const today = new Date(); const monday = new Date(today); monday.setHours(0,0,0,0); monday.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1) + (window.plannerWeekOffset * 7));
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23,59,59,999);
    const pwt = document.getElementById('planner-week-title'); if (pwt) pwt.innerText = `${monday.toLocaleDateString('es-ES', {day:'numeric', month:'short'})} - ${sunday.toLocaleDateString('es-ES', {day:'numeric', month:'short'})}`;
    try {
        const plans = await window.apiCall(`/diet-plan?start_date=${monday.toISOString().split('T')[0]}&end_date=${sunday.toISOString().split('T')[0]}`);
        window.currentPlans = plans;
        renderPlanner(monday, plans);
        updatePlannerMacros();
    } catch (e) { console.error('Error planner:', e); }
};

function renderPlanner(monday, plans) {
    const grid = document.getElementById('planner-week-grid'); if(!grid) return;
    const dayPills = document.getElementById('day-selector-pills');
    grid.innerHTML = '';
    if (dayPills) dayPills.innerHTML = '';
    
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const meals = [{ type: 'breakfast', label: 'Desayuno' }, { type: 'lunch', label: 'Comida' }, { type: 'snack', label: 'Merienda' }, { type: 'dinner', label: 'Cena' }];
    
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday); d.setDate(monday.getDate() + i);
        const dStr = d.toISOString().split('T')[0];
        
        // Add Day Pill
        if (dayPills) {
            const pill = document.createElement('div');
            pill.className = `day-pill ${dStr === window.plannerActiveDate ? 'active' : ''}`;
            pill.innerText = `${days[i]} ${d.getDate()}`;
            pill.onclick = () => {
                window.plannerActiveDate = dStr;
                document.querySelectorAll('.day-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                updatePlannerMacros();
            };
            dayPills.appendChild(pill);
        }

        const dayCol = document.createElement('div'); dayCol.className = 'planner-day-col';
        dayCol.innerHTML = `<div class="day-header ${dStr === new Date().toISOString().split('T')[0] ? 'today' : ''}"><span class="day-name">${days[i]}</span><span class="day-number">${d.getDate()}</span></div>`;
        meals.forEach(meal => {
            const slot = document.createElement('div'); slot.className = 'meal-slot'; slot.innerHTML = `<div class="meal-slot-label">${meal.label}</div>`;
            plans.filter(p => p.date === dStr && p.meal_type === meal.type).forEach(p => {
                const item = document.createElement('div'); item.className = `planned-item ${p.is_consumed ? 'consumed' : ''}`;
                const name = p.recipe_id ? (window.recipes?.find(r => r.id === p.recipe_id)?.name || 'Receta') : (p.custom_name || 'Producto');
                item.innerHTML = `<span>${name}</span>`;
                item.onclick = (e) => { e.stopPropagation(); window.togglePlanConsumed(p.id, p.is_consumed); };
                item.oncontextmenu = (e) => { e.preventDefault(); if(confirm('¿Borrar?')) window.apiCall(`/diet-plan/${p.id}`, 'DELETE').then(() => window.loadPlanner()); };
                slot.appendChild(item);
            });
            dayCol.appendChild(slot);
        });
        grid.appendChild(dayCol);
    }
}

window.updatePlannerMacros = async () => {
    if (!window.plannerActiveDate) return;
    const plans = (window.currentPlans || []).filter(p => p.date === window.plannerActiveDate);
    
    let totals = { kcal: 0, proteins: 0, carbs: 0, fat: 0 };
    
    for (const p of plans) {
        if (p.recipe_id) {
            const r = window.recipes.find(rec => rec.id === p.recipe_id);
            if (r) {
                totals.kcal += r.kcal * p.quantity;
                totals.proteins += r.proteins * p.quantity;
                totals.carbs += r.carbs * p.quantity;
                totals.fat += r.fat * p.quantity;
            }
        } else if (p.product_barcode) {
            const prod = window.products.find(pr => pr.barcode === p.product_barcode);
            if (prod && prod.kcal_100g) {
                const weight = (prod.unit_type === 'g' || prod.unit_type === 'ml') ? p.quantity : (prod.serving_size ? p.quantity * prod.serving_size : 0);
                totals.kcal += (prod.kcal_100g/100) * weight;
                totals.proteins += (prod.proteins_100g/100) * weight;
                totals.carbs += (prod.carbs_100g/100) * weight;
                totals.fat += (prod.fat_100g/100) * weight;
            }
        }
    }

    // Update Title
    const dt = new Date(window.plannerActiveDate);
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    document.getElementById('planner-day-macro-title').innerText = `Macros del ${dt.toLocaleDateString('es-ES', options)}`;

    // Get Goals
    const goals = await window.apiCall('/stats/macro-goals');
    
    // Update Values
    const setVal = (id, val, goal) => {
        const el = document.getElementById(id);
        if (el) el.innerText = `${Math.round(val)} / ${Math.round(goal)}${id.includes('kcal') ? '' : 'g'}`;
    };
    
    setVal('plan-macro-kcal', totals.kcal, goals.kcal);
    setVal('plan-macro-proteins', totals.proteins, goals.proteins);
    setVal('plan-macro-carbs', totals.carbs, goals.carbs);
    setVal('plan-macro-fat', totals.fat, goals.fat);

    // Update Bars
    const setFill = (id, cur, max) => {
        const fill = document.getElementById(id);
        if (fill) fill.style.width = Math.min(100, (cur/max)*100) + '%';
    };
    setFill('plan-fill-proteins', totals.proteins, goals.proteins);
    setFill('plan-fill-carbs', totals.carbs, goals.carbs);
    setFill('plan-fill-fat', totals.fat, goals.fat);

    // Update Chart
    const ctx = document.getElementById('plannerKcalChart')?.getContext('2d');
    if (!ctx) return;
    
    if (window.plannerCharts.kcal) window.plannerCharts.kcal.destroy();
    
    const left = Math.max(0, goals.kcal - totals.kcal);
    window.plannerCharts.kcal = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [totals.kcal, left],
                backgroundColor: [totals.kcal > goals.kcal ? '#ef4444' : '#1D9E75', '#2a2a2a'],
                borderWidth: 0,
                borderRadius: left > 0 ? 0 : 0
            }]
        },
        options: { cutout: '80%', plugins: { tooltip: { enabled: false } }, events: [] }
    });
};

window.togglePlanConsumed = async (id, current) => {
    try {
        await window.apiCall(`/diet-plan/${id}?is_consumed=${!current}`, 'PATCH'); window.loadPlanner();
        if (!current) window.showToast('¡Buen provecho!', 'success');
    } catch (e) { console.error(e); }
};

window.openPlannerModal = () => {
    const today = new Date().toISOString().split('T')[0];
    const inp = document.getElementById('plan-date-input'); if (inp) inp.value = today;
    const recSelect = document.getElementById('plan-recipe-id'); if (recSelect) recSelect.innerHTML = (window.recipes || []).map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    document.getElementById('planner-modal')?.classList.add('active');
};

window.closePlannerModal = () => { document.getElementById('planner-modal')?.classList.remove('active'); };

window.savePlan = async () => {
    const planData = {
        date: document.getElementById('plan-date-input').value, meal_type: document.getElementById('plan-meal-type').value, recipe_id: window.planType === 'recipe' ? parseInt(document.getElementById('plan-recipe-id').value) : null, product_barcode: window.planType === 'product' ? document.getElementById('plan-product-search').dataset.barcode : null, custom_name: window.planType === 'product' && !document.getElementById('plan-product-search').dataset.barcode ? document.getElementById('plan-product-search').value : null, quantity: parseFloat(document.getElementById('plan-quantity').value) || 1
    };
    try {
        await window.apiCall('/diet-plan', 'POST', planData); window.showToast('Añadido al plan', 'success'); window.closePlannerModal(); window.loadPlanner();
    } catch (e) { window.showToast('Error: ' + e.message, 'error'); }
};

window.switchPlanType = (type) => {
    window.planType = type;
    const btnRec = document.getElementById('tab-plan-recipe'), btnProd = document.getElementById('tab-plan-product');
    const viewRec = document.getElementById('plan-recipe-select'), viewProd = document.getElementById('plan-product-select');
    if (type === 'recipe') { btnRec?.classList.add('active'); btnProd?.classList.remove('active'); viewRec?.classList.remove('hidden'); viewProd?.classList.add('hidden'); }
    else { btnRec?.classList.remove('active'); btnProd?.classList.add('active'); viewRec?.classList.add('hidden'); viewProd?.classList.remove('hidden'); }
};

// Generic Search Logic for Ingredients and Planner
window.searchIngredientProduct = () => {
    const input = document.getElementById('ing-search');
    const results = document.getElementById('ing-search-results');
    performProductSearch(input, results, (bc, name) => {
        input.value = name; input.dataset.barcode = bc;
        const p = window.products.find(prod => prod.barcode === bc); if (p) { const iu = document.getElementById('ing-unit'); if (iu) iu.value = p.unit_type || 'uds'; }
        results.classList.add('hidden');
    }, (name) => {
        input.value = name; delete input.dataset.barcode;
        results.classList.add('hidden');
    });
};

window.searchPlanProduct = () => {
    const input = document.getElementById('plan-product-search');
    const results = document.getElementById('plan-product-results');
    performProductSearch(input, results, (bc, name) => {
        input.value = name; input.dataset.barcode = bc;
        results.classList.add('hidden');
    }, (name) => {
        input.value = name; delete input.dataset.barcode;
        results.classList.add('hidden');
    });
};

function performProductSearch(input, resultsContainer, onSelectProduct, onSelectCustom) {
    if (!input || !resultsContainer) return;
    const query = window.normalizeText(input.value);
    if (query.length < 2) { resultsContainer.classList.add('hidden'); return; }
    
    const matches = window.products.filter(p => window.normalizeText(p.name).includes(query) || p.barcode.includes(query)).slice(0, 10);
    
    let html = '';
    if (matches.length === 0) {
        html = `<div class="search-result-item" onclick="window.handleSearchCustom('${input.id}')">
                    <div class="sr-info"><span class="sr-name">"${input.value}"</span><small class="sr-meta">Ingrediente libre (sin macros)</small></div>
                </div>`;
    } else {
        html = matches.map(p => `
            <div class="search-result-item" onclick="window.handleSearchSelect('${input.id}', '${p.barcode}', '${p.name.replace(/'/g, "\\'")}')">
                <div class="sr-info">
                    <span class="sr-name">${p.name}</span>
                    <small class="sr-meta">${p.stock}${p.unit_type} en stock • ${p.kcal_100g || 0} kcal/100g</small>
                </div>
            </div>`).join('');
    }
    
    resultsContainer.innerHTML = html;
    resultsContainer.classList.remove('hidden');
    
    // Store callbacks globally for the onclick handlers
    window._searchCallbacks = window._searchCallbacks || {};
    window._searchCallbacks[input.id] = { product: onSelectProduct, custom: onSelectCustom };
}

window.handleSearchSelect = (inputId, bc, name) => { window._searchCallbacks[inputId].product(bc, name); };
window.handleSearchCustom = (inputId) => { window._searchCallbacks[inputId].custom(document.getElementById(inputId).value); };

window.selectIngredientProduct = (bc, name) => { /* Legacy hook */ };
window.selectCustomIngredient = (name) => { /* Legacy hook */ };

window.addIngredientToRecipe = () => {
    const nameInput = document.getElementById('ing-search'), qtyInput = document.getElementById('ing-qty'), unitInput = document.getElementById('ing-unit');
    if (!nameInput?.value || !qtyInput?.value) { window.showToast('Completa ingrediente y cantidad', 'warning'); return; }
    window.currentRecipeEditorIngredients.push({ product_barcode: nameInput.dataset.barcode || null, custom_name: nameInput.dataset.barcode ? null : nameInput.value, quantity: parseFloat(qtyInput.value), unit: unitInput.value });
    nameInput.value = ''; delete nameInput.dataset.barcode; qtyInput.value = ''; renderEditorIngredients();
};

window.consumeRecipe = async (id) => {
    const r = (window.recipes || []).find(rec => rec.id === id); if (!r) return;
    const servings = prompt(`¿Raciones a descontar del stock? (Receta: ${r.servings})`, "1"); if (servings === null) return;
    try {
        await window.apiCall(`/recipes/${id}/consume?servings=${servings}`, 'POST');
        window.showToast(`Consumido: ${r.name}`, 'success'); await window.loadProducts(); await window.updateMacros();
    } catch (e) { window.showToast('Error: ' + e.message, 'error'); }
};

window.deleteRecipe = async (id) => { if (confirm('¿Eliminar receta?')) { try { await window.apiCall(`/recipes/${id}`, 'DELETE'); window.showToast('Receta eliminada', 'success'); window.loadRecipes(); } catch (e) { window.showToast('Error: ' + e.message, 'error'); } } };
