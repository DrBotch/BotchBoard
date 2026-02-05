#!/usr/bin/env node
/**
 * Botch Dashboard Test Suite
 * Tests all API endpoints and UI pages
 */

const puppeteer = require('puppeteer');
const http = require('http');

const BASE_URL = 'http://127.0.0.1:8765';
const RESULTS = { passed: 0, failed: 0, errors: [] };

// API Endpoints to test
const API_TESTS = [
  { endpoint: '/api/meta.json', expectType: 'object', required: ['generatedAt', 'live', 'gateway'] },
  { endpoint: '/api/system.json', expectType: 'object', required: ['uptime'] },
  { endpoint: '/api/cron.json', expectType: 'array', minLength: 1 },
  { endpoint: '/api/sessions.json', expectType: 'array' },
  { endpoint: '/api/sessions-index.json', expectType: 'array' },
  { endpoint: '/api/skills.json', expectType: 'array', minLength: 1 },
  { endpoint: '/api/usage.json', expectType: 'object' },
  { endpoint: '/api/memory-main.json', expectType: 'string' },
  { endpoint: '/api/memory-files.json', expectType: 'array' },
  { endpoint: '/api/config-files.json', expectType: 'object' },
  { endpoint: '/api/chat-history.json', expectType: 'object' },
];

// UI Pages to test
const UI_TESTS = [
  { name: 'Overview', path: '/', selector: '.dashboard, [data-page="overview"]' },
  { name: 'Memory', path: '/#memory', clickNav: 'Memory' },
  { name: 'Sessions', path: '/#sessions', clickNav: 'Sessions' },
  { name: 'Chat Logs', path: '/#chat', clickNav: 'Chat Logs' },
  { name: 'Cron Jobs', path: '/#cron', clickNav: 'Cron Jobs' },
  { name: 'Skills', path: '/#skills', clickNav: 'Skills' },
  { name: 'Usage', path: '/#usage', clickNav: 'Usage' },
  { name: 'Config', path: '/#config', clickNav: 'Config' },
  { name: 'System', path: '/#system', clickNav: 'System' },
];

function fetch(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data, parseError: true });
        }
      });
    }).on('error', reject);
  });
}

async function testAPI(test) {
  const url = BASE_URL + test.endpoint;
  console.log(`  Testing ${test.endpoint}...`);
  
  try {
    const res = await fetch(url);
    
    if (res.status !== 200) {
      throw new Error(`HTTP ${res.status}`);
    }
    
    if (res.parseError && test.expectType !== 'string') {
      throw new Error(`JSON parse error`);
    }
    
    const data = res.data;
    
    // Type check
    if (test.expectType === 'array' && !Array.isArray(data)) {
      throw new Error(`Expected array, got ${typeof data}`);
    }
    if (test.expectType === 'object' && (typeof data !== 'object' || Array.isArray(data))) {
      throw new Error(`Expected object, got ${Array.isArray(data) ? 'array' : typeof data}`);
    }
    if (test.expectType === 'string' && typeof data !== 'string') {
      throw new Error(`Expected string, got ${typeof data}`);
    }
    
    // Required fields
    if (test.required && test.expectType === 'object') {
      for (const field of test.required) {
        if (!(field in data)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
    }
    
    // Min length for arrays
    if (test.minLength && Array.isArray(data) && data.length < test.minLength) {
      throw new Error(`Array too short: ${data.length} < ${test.minLength}`);
    }
    
    console.log(`    ✅ PASS`);
    RESULTS.passed++;
    return true;
  } catch (e) {
    console.log(`    ❌ FAIL: ${e.message}`);
    RESULTS.failed++;
    RESULTS.errors.push({ test: test.endpoint, error: e.message });
    return false;
  }
}

async function testUI(browser, test) {
  console.log(`  Testing UI: ${test.name}...`);
  const page = await browser.newPage();
  const errors = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', err => errors.push(err.message));
  
  try {
    await page.setViewport({ width: 1400, height: 900 });
    await page.goto(BASE_URL + '/', { waitUntil: 'networkidle0', timeout: 15000 });
    
    // Click navigation if needed
    if (test.clickNav) {
      const navItems = await page.$$('nav a, .nav-item, .sidebar a, [data-nav]');
      let clicked = false;
      for (const item of navItems) {
        const text = await item.evaluate(el => el.textContent);
        if (text && text.includes(test.clickNav)) {
          await item.click();
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        // Try text selector
        try {
          await page.click(`text="${test.clickNav}"`);
        } catch (e) {
          // Try partial match
          const allText = await page.evaluate((nav) => {
            const els = document.querySelectorAll('*');
            for (const el of els) {
              if (el.textContent && el.textContent.trim() === nav) {
                el.click();
                return 'clicked';
              }
            }
            return 'not found';
          }, test.clickNav);
        }
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    
    // Wait for content to load
    await new Promise(r => setTimeout(r, 3000));
    
    // Take screenshot
    const screenshotPath = `/tmp/test-${test.name.toLowerCase().replace(/\s+/g, '-')}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    
    // Check for critical errors
    const criticalErrors = errors.filter(e => 
      e.includes('is not a function') || 
      e.includes('Cannot read') ||
      e.includes('undefined') ||
      e.includes('null')
    );
    
    if (criticalErrors.length > 0) {
      throw new Error(`JS errors: ${criticalErrors.join('; ')}`);
    }
    
    console.log(`    ✅ PASS (screenshot: ${screenshotPath})`);
    RESULTS.passed++;
    await page.close();
    return true;
  } catch (e) {
    console.log(`    ❌ FAIL: ${e.message}`);
    RESULTS.failed++;
    RESULTS.errors.push({ test: `UI: ${test.name}`, error: e.message, jsErrors: errors });
    await page.close();
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('BOTCH DASHBOARD TEST SUITE');
  console.log('='.repeat(60));
  console.log();
  
  // Test APIs
  console.log('📡 API TESTS');
  console.log('-'.repeat(40));
  for (const test of API_TESTS) {
    await testAPI(test);
  }
  console.log();
  
  // Test UI
  console.log('🖥️  UI TESTS');
  console.log('-'.repeat(40));
  
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: '/snap/bin/chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    for (const test of UI_TESTS) {
      await testUI(browser, test);
    }
  } catch (e) {
    console.log(`  ❌ Browser launch failed: ${e.message}`);
    RESULTS.failed++;
    RESULTS.errors.push({ test: 'Browser', error: e.message });
  } finally {
    if (browser) await browser.close();
  }
  
  // Summary
  console.log();
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${RESULTS.passed}`);
  console.log(`❌ Failed: ${RESULTS.failed}`);
  
  if (RESULTS.errors.length > 0) {
    console.log();
    console.log('ERRORS:');
    for (const err of RESULTS.errors) {
      console.log(`  - ${err.test}: ${err.error}`);
      if (err.jsErrors && err.jsErrors.length > 0) {
        for (const je of err.jsErrors.slice(0, 3)) {
          console.log(`      JS: ${je.slice(0, 100)}`);
        }
      }
    }
  }
  
  console.log();
  process.exit(RESULTS.failed > 0 ? 1 : 0);
}

main().catch(console.error);
