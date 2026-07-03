const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const consoleMessages = [];
  const pageErrors = [];

  page.on('console', (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  const result = await page.evaluate(() => ({
    title: document.title,
    bodyTextLength: document.body.innerText.trim().length,
    bodyTextSample: document.body.innerText.trim().slice(0, 500),
    hasErrorOverlay: Boolean(document.querySelector('.vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]')),
    visibleButtons: Array.from(document.querySelectorAll('button'))
      .filter((button) => button.offsetParent !== null)
      .slice(0, 25)
      .map((button) => button.textContent?.trim() || button.getAttribute('title') || button.getAttribute('aria-label') || ''),
    inputs: document.querySelectorAll('input').length,
    fileInputs: document.querySelectorAll('input[type="file"]').length,
  }));

  await browser.close();
  console.log(JSON.stringify({ result, consoleMessages, pageErrors }, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
