import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });

async function captureHome() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  await page.goto('http://187.124.130.193:8300/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'docs/assets/marketing/pilangfuse-home.png', fullPage: true });
  await page.close();
}

async function captureCompletedWorkflow() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 2200 } });
  await page.goto('http://187.124.130.193:8300/', { waitUntil: 'networkidle' });
  await page.fill('#topic', 'AI agents for software engineering');
  await page.click('button[type="submit"]');
  await page.waitForSelector('#status-badge.completed, #status-badge.failed', { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/assets/marketing/pilangfuse-completed-workflow.png', fullPage: true });
  await page.close();
}

async function captureSettings() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1700 } });
  await page.goto('http://187.124.130.193:8300/', { waitUntil: 'networkidle' });
  await page.click('#open-settings');
  await page.waitForSelector('#settings-modal:not(.hidden)', { timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'docs/assets/marketing/pilangfuse-settings.png', fullPage: true });
  await page.close();
}

try {
  await captureHome();
  await captureCompletedWorkflow();
  await captureSettings();
} finally {
  await browser.close();
}
