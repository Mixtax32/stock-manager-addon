/* 
   Recipes & Diet Planner Logic
   v0.6.0
*/

window.plannerWeekOffset = 0;
let currentRecipeEditorIngredients = [];
let planType = 'recipe';

window.loadRecipes = async () => {
    try {
        window.recipes = await window.apiCall('/recipes');
        window.updateRecipeList();
    } catch (e) { console.error('Error loading recipes:', e); }
};

window.updateRecipeList = () => {
    const container = document.getElementById('recipe-list');
    const query = window.normalizeText(document.getElementById('recipe-search')?.value || '');
    const filtered = (window.recipes || []).filter(r => window.normalizeText(r.name).includes(query));
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay recetas que coincidan</div>';
        return;
    }

    container.innerHTML = filtered.map(r => `
        <div class="recipe-card">
            <div class="recipe-img">
                <img src="${r.image_url || 'https://placehold.co/400x200/111/444?text=' + encodeURIComponent(r.name)}" onerror="this.src='https://placehold.co/400x200/111/444?text=Receta'">
            </div>
            <div class="recipe-info">
                <div class="recipe-title">${r.name}</div>
                <div class="recipe-meta">
                    <span>🔥 ${Math.round(r.kcal)} kcal</span>
                    <span>🥩 ${Math.round(r.proteins)}g</span>
                    <span>🥣 ${r.servings} raciones</span>
                </div>
                <div style="display: flex; gap: 8px; margin-top: 12px;">
                    <button class="btn btn-primary" style="flex:1; font-size:12px;" onclick="window.consumeRecipe(${r.id})">Consumir</button>
                    <button class="btn btn-secondary" style="width:40px;" onclick="window.openRecipeEditor(${r.id})">✏️</button>
                    <button class="btn btn-del" onclick="window.deleteRecipe(${r.id})">✕</button>
                </div>
            </div>
        </div>
    `).join('');
};

window.openRecipeEditor = (id = null) => {
    const title = document.getElementById('recipe-editor-title');
    const nameInput = document.getElementById('recipe-name-input');
    const instrInput = document.getElementById('recipe-instructions-input');
    const servingsInput = document.getElementById('recipe-servings-input');
    const imageInput = document.getElementById('recipe-image-input');
    currentRecipeEditorIngredients = [];
    
    if (id) {
        const r = (window.recipes || []).find(rec => rec.id === id);
        title.innerText = 'Editar Receta';
        nameInput.value = r.name;
        instrInput.value = r.instructions || '';
        servingsInput.value = r.servings;
        imageInput.value = r.image_url || '';
        currentRecipeEditorIngredients = r.ingredients.map(ing => ({
            product_barcode: ing.product_barcode,
            custom_name: ing.custom_name,
            quantity: ing.quantity,
            unit: ing.unit
        }));
        nameInput.dataset.editId = id;
    } else {
        title.innerText = 'Nueva Receta';
        nameInput.value = ''; instrInput.value = ''; servingsInput.value = 1; imageInput.value = '';
        delete nameInput.dataset.editId;
    }
    renderEditorIngredients();
    document.getElementById('recipe-editor-panel').classList.add('active');
};

function renderEditorIngredients() {
    const list = document.getElementById('recipe-ingredients-list');
    list.innerHTML = currentRecipeEditorIngredients.map((ing, i) => `
        <div class="ingredient-item">
            <span>${ing.custom_name || window.products.find(p => p.barcode === ing.product_barcode)?.name || 'Producto'}</span>
            <div style="display: flex; align-items: center; gap: 8px;">
                <b>${ing.quantity} ${ing.unit}</b>
                <button class="btn-del" onclick="window.removeIngFromEditor(${i})">✕</button>
            </div>
        </div>
    `).join('');
    updateRecipeMacrosPreview();
}

window.removeIngFromEditor = (i) => { currentRecipeEditorIngredients.splice(i, 1); renderEditorIngredients(); };

window.saveRecipe = async () => {
    const editId = document.getElementById('recipe-name-input').dataset.editId;
    const recipeData = {
        name: document.getElementById('recipe-name-input').value,
        description: "",
        instructions: document.getElementById('recipe-instructions-input').value,
        servings: parseInt(document.getElementById('recipe-servings-input').value),
        image_url: document.getElementById('recipe-image-input').value,
        ingredients: currentRecipeEditorIngredients,
        kcal: parseFloat(document.getElementById('prev-recipe-kcal').innerText),
        proteins: parseFloat(document.getElementById('prev-recipe-proteins').innerText),
        carbs: parseFloat(document.getElementById('prev-recipe-carbs').innerText),
        fat: parseFloat(document.getElementById('prev-recipe-fat').innerText)
    };
    try {
        if (editId) await window.apiCall(`/recipes/${editId}`, 'DELETE');
        await window.apiCall('/recipes', 'POST', recipeData);
        window.showToast('Receta guardada', 'success');
        document.getElementById('recipe-editor-panel').classList.remove('active');
        window.loadRecipes();
    } catch (e) { window.showToast('Error: ' + e.message, 'error'); }
};

function updateRecipeMacrosPreview() {
    let totals = { kcal: 0, proteins: 0, carbs: 0, fat: 0 };
    const servings = parseFloat(document.getElementById('recipe-servings-input').value) || 1;
    currentRecipeEditorIngredients.forEach(ing => {
        if (ing.product_barcode) {
            const p = window.products.find(prod => prod.barcode === ing.product_barcode);
            if (p && p.kcal_100g) {
                let weight = (ing.unit === 'g' || ing.unit === 'ml') ? ing.quantity : (p.serving_size ? ing.quantity * p.serving_size : 0);
                totals.kcal += (p.kcal_100g / 100) * weight;
                totals.proteins += (p.proteins_100g / 100) * weight;
                totals.carbs += (p.carbs_100g / 100) * weight;
                totals.fat += (p.fat_100g / 100) * weight;
            }
        }
    });
    document.getElementById('prev-recipe-kcal').innerText = Math.round(totals.kcal / servings);
    document.getElementById('prev-recipe-proteins').innerText = Math.round(totals.proteins / servings) + 'g';
    document.getElementById('prev-recipe-carbs').innerText = Math.round(totals.carbs / servings) + 'g';
    document.getElementById('prev-recipe-fat').innerText = Math.round(totals.fat / servings) + 'g';
}

window.loadPlanner = async () => {
    const today = new Date();
    const monday = new Date(today); monday.setHours(0, 0, 0, 0);
    monday.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1) + (window.plannerWeekOffset * 7));
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
    
    document.getElementById('planner-week-title').innerText = `${monday.toLocaleDateString('es-ES', {day:'numeric', month:'short'})} - ${sunday.toLocaleDateString('es-ES', {day:'numeric', month:'short'})}`;
    try {
        const plans = await window.apiCall(`/diet-plan?start_date=${monday.toISOString().split('T')[0]}&end_date=${sunday.toISOString().split('T')[0]}`);
        renderPlanner(monday, plans);
    } catch (e) { console.error('Error planner:', e); }
};

function renderPlanner(monday, plans) {
    const grid = document.getElementById('planner-week-grid'); grid.innerHTML = '';
    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const meals = [{ type: 'breakfast', label: 'Desayuno' }, { type: 'lunch', label: 'Comida' }, { type: 'snack', label: 'Merienda' }, { type: 'dinner', label: 'Cena' }];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday); d.setDate(monday.getDate() + i);
        const dStr = d.toISOString().split('T')[0];
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

window.togglePlanConsumed = async (id, current) => {
    try {
        await window.apiCall(`/diet-plan/${id}?is_consumed=${!current}`, 'PATCH');
        window.loadPlanner();
        if (!current) window.showToast('¡Buen provecho!', 'success');
    } catch (e) { console.error(e); }
};

window.savePlan = async () => {
    const planData = {
        date: document.getElementById('plan-date-input').value,
        meal_type: document.getElementById('plan-meal-type').value,
        recipe_id: planType === 'recipe' ? parseInt(document.getElementById('plan-recipe-id').value) : null,
        product_barcode: planType === 'product' ? document.getElementById('plan-product-search').dataset.barcode : null,
        custom_name: planType === 'product' && !document.getElementById('plan-product-search').dataset.barcode ? document.getElementById('plan-product-search').value : null,
        quantity: parseFloat(document.getElementById('plan-quantity').value) || 1
    };
    try {
        await window.apiCall('/diet-plan', 'POST', planData);
        window.showToast('Añadido', 'success');
        document.getElementById('planner-modal').classList.remove('active');
        window.loadPlanner();
    } catch (e) { window.showToast('Error: ' + e.message, 'error'); }
};

window.switchPlanType = (type) => {
    planType = type;
    const btnRec = document.getElementById('tab-plan-recipe'), btnProd = document.getElementById('tab-plan-product');
    const viewRec = document.getElementById('plan-recipe-select'), viewProd = document.getElementById('plan-product-select');
    if (type === 'recipe') { btnRec.classList.add('active'); btnProd.classList.remove('active'); viewRec.classList.remove('hidden'); viewProd.classList.add('hidden'); }
    else { btnRec.classList.remove('active'); btnProd.classList.add('active'); viewRec.classList.add('hidden'); viewProd.classList.remove('hidden'); }
};

window.searchIngredientProduct = () => {
    const query = window.normalizeText(document.getElementById('ing-search').value);
    const results = document.getElementById('ing-search-results');
    if (query.length < 2) { results.classList.add('hidden'); return; }
    const matches = window.products.filter(p => window.normalizeText(p.name).includes(query) || p.barcode.includes(query)).slice(0, 5);
    if (matches.length === 0) results.innerHTML = `<div class="p-2" onclick="window.selectCustomIngredient('${document.getElementById('ing-search').value}')">Ingrediente libre</div>`;
    else results.innerHTML = matches.map(p => `<div class="p-2 border-b border-gray-800 hover:bg-gray-800 flex justify-between" onclick="window.selectIngredientProduct('${p.barcode}', '${p.name.replace(/'/g, "\\'")}')"><span>${p.name}</span><small>${p.stock}${p.unit_type}</small></div>`).join('');
    results.classList.remove('hidden');
};

window.selectIngredientProduct = (bc, name) => {
    document.getElementById('ing-search').value = name; document.getElementById('ing-search').dataset.barcode = bc; document.getElementById('ing-search-results').classList.add('hidden');
    const p = window.products.find(prod => prod.barcode === bc); if (p) document.getElementById('ing-unit').value = p.unit_type || 'uds';
};

window.addIngredientToRecipe = () => {
    const nameInput = document.getElementById('ing-search'), qtyInput = document.getElementById('ing-qty'), unitInput = document.getElementById('ing-unit');
    if (!nameInput.value || !qtyInput.value) return;
    currentRecipeEditorIngredients.push({ product_barcode: nameInput.dataset.barcode || null, custom_name: nameInput.dataset.barcode ? null : nameInput.value, quantity: parseFloat(qtyInput.value), unit: unitInput.value });
    nameInput.value = ''; delete nameInput.dataset.barcode; qtyInput.value = ''; renderEditorIngredients();
};

window.consumeRecipe = async (id) => {
    const r = (window.recipes || []).find(rec => rec.id === id); if (!r) return;
    const servings = prompt(`¿Raciones? (Receta: ${r.servings})`, "1"); if (servings === null) return;
    try {
        await window.apiCall(`/recipes/${id}/consume?servings=${servings}`, 'POST');
        window.showToast(`Consumido: ${r.name}`, 'success');
        await window.loadProducts(); await window.updateMacros();
    } catch (e) { window.showToast('Error: ' + e.message, 'error'); }
};
