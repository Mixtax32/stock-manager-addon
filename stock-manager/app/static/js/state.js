/* 
   State & Global Configuration
   v0.6.1
*/
window.API_BASE = `${window.location.pathname.replace(/\/$/, '')}/api`;
window.products = [];
window.allLocations = [];
window.currentBarcode = null;
window.html5QrCode = null;
window.currentTicketStream = null;
window.currentScannedImageUrl = null;
window.selectedProducts = new Set();
window.isSelectionMode = false;
window.manageFilter = { name: '', location: '', category: '' };
window.consumptionChart = null;
window.kcalChart = null;
window.fullKcalChart = null;
window.filteredLocation = window.filteredLocation || null;

// Persistence for modular logic
window.pendingChanges = {};
window.pendingBatchChanges = {};
window.originalData = {};
window.originalBatchData = {};
window.currentTicketItems = [];
window.currentPortionBarcode = null;
window.recipes = [];
window.plannerWeekOffset = 0;
window.currentRecipeEditorIngredients = [];
window.planType = 'recipe';
window.scanSessionChanges = { batches: {}, newQty: 0, newExpiry: null };
window.dateModalCallback = null;
window.pickerState = { 
    inputId: null, 
    year: new Date().getFullYear(), 
    month: new Date().getMonth() + 1, 
    day: new Date().getDate(), 
    scrollOffset: {} 
};
