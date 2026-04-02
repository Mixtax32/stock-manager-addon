/* 
   State & Global Configuration
   v0.6.0
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

// Temporary bridge for functions that still expect product as global var 
// but define it as window.products for clarity
var products = window.products;
var allLocations = window.allLocations;
var currentBarcode = window.currentBarcode;
var html5QrCode = window.html5QrCode;
var currentTicketStream = window.currentTicketStream;
var currentScannedImageUrl = window.currentScannedImageUrl;
var selectedProducts = window.selectedProducts;
var isSelectionMode = window.isSelectionMode;
var manageFilter = window.manageFilter;
var consumptionChart = window.consumptionChart;
var kcalChart = window.kcalChart;
var fullKcalChart = window.fullKcalChart;
var filteredLocation = window.filteredLocation;
