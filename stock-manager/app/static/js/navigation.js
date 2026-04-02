/* 
   Navigation & Theme Management
   v0.6.0
*/

window.showPage = (targetPage) => {
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    const pages = document.querySelectorAll('.page');
    const pageTitle = document.getElementById('page-title');

    pages.forEach(p => {
        if (p.getAttribute('data-page') === targetPage) {
            p.classList.remove('hidden');
            const navItem = Array.from(navItems).find(i => i.getAttribute('data-page') === targetPage);
            
            navItems.forEach(i => i.classList.remove('active'));
            if (navItem) {
                navItem.classList.add('active');
                if (pageTitle) pageTitle.textContent = navItem.querySelector('span')?.textContent || targetPage;
            } else {
                if (pageTitle) pageTitle.textContent = targetPage.charAt(0).toUpperCase() + targetPage.slice(1);
            }
            
            if (targetPage === 'scan') window.scrollTo({ top: 0, behavior: 'smooth' });
            if (targetPage === 'recipes') {
                if (window.loadRecipes) window.loadRecipes();
                if (window.loadPlanner) window.loadPlanner();
            }
        } else {
            p.classList.add('hidden');
        }
    });
};

window.toggleTheme = () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    try { localStorage.setItem('theme', isLight ? 'light' : 'dark'); } catch(e){}
    // Update charts if they exist
    setTimeout(() => { if (window.updateCharts) window.updateCharts(); }, 100);
};

window.initNavigation = () => {
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            window.showPage(item.getAttribute('data-page'));
        });
    });

    // Theme initialization
    try {
        if (localStorage.getItem('theme') === 'light') {
            document.body.classList.add('light-mode');
        }
    } catch(e){}

    // Default page
    window.showPage('dashboard');
};

window.switchRecipeTab = (tab) => {
    const plannerBtn = document.getElementById('tab-btn-planner');
    const recipesBtn = document.getElementById('tab-btn-recipes');
    const plannerContent = document.getElementById('planner-tab-content');
    const recipesContent = document.getElementById('recipes-tab-content');
    const newRecipeBtn = document.getElementById('btn-new-recipe');
    const addPlanBtn = document.getElementById('btn-add-plan');

    if (tab === 'planner') {
        plannerBtn.classList.add('active');
        recipesBtn.classList.remove('active');
        plannerContent.classList.remove('hidden');
        recipesContent.classList.add('hidden');
        if (newRecipeBtn) newRecipeBtn.style.display = 'none';
        if (addPlanBtn) addPlanBtn.style.display = 'block';
        if (window.loadPlanner) window.loadPlanner();
    } else {
        plannerBtn.classList.remove('active');
        recipesBtn.classList.add('active');
        plannerContent.classList.add('hidden');
        recipesContent.classList.remove('hidden');
        if (newRecipeBtn) newRecipeBtn.style.display = 'block';
        if (addPlanBtn) addPlanBtn.style.display = 'none';
        if (window.loadRecipes) window.loadRecipes();
    }
};

window.changePlannerWeek = (delta) => {
    window.plannerWeekOffset = (window.plannerWeekOffset || 0) + delta;
    if (window.loadPlanner) window.loadPlanner();
};
