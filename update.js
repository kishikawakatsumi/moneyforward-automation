"use strict";

const { chromium } = require("playwright");
const { login } = require("./common");
require("dotenv").config();

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    baseURL: "https://moneyforward.com",
  });

  const page = await context.newPage();
  await login(page);

  await page.goto("/accounts");

  const buttons = await page.$$(
    'input:not(disabled)[type="submit"][name="commit"][value="更新"]'
  );
  for (const button of buttons) {
    await button.click();
  }

  await browser.close();
})();
