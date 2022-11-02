"use strict";

const axios = require("axios").default;
const { google } = require("googleapis");

exports.login = async (page) => {
  await page.goto("/");
  await page.click('a[href="/sign_in"]');
  await page.waitForSelector(".logo");

  await page.$$eval("a", (elements) => {
    const signin = elements.filter((el) =>
      el.href.startsWith("https://id.moneyforward.com/sign_in/email?")
    )[0];
    signin.click();
  });

  await page.fill('input[type="email"]', process.env.EMAIL);
  await page.click('input[type="submit"]');

  await page.waitForTimeout(500);

  await page.fill('input[type="password"]', process.env.PASSWORD);
  await page.click('input[type="submit"]');
};

exports.googleAuth = async () => {
  const credentials = JSON.parse(process.env.CREDENTIALS);
  const { client_id, client_secret, redirect_uris } = credentials.installed;

  const auth = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  const accessToken = await refreshGoogleAccessToken(
    client_id,
    client_secret,
    process.env.REFRESH_TOKEN
  );
  auth.setCredentials(accessToken);

  return auth;
};

exports.sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

async function refreshGoogleAccessToken(
  client_id,
  client_secret,
  refresh_token
) {
  const response = await axios.post(
    "https://www.googleapis.com/oauth2/v4/token",
    {
      client_id,
      client_secret,
      refresh_token,
      grant_type: "refresh_token",
    }
  );

  return response.data;
}
