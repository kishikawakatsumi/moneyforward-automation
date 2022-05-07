"use strict";

const axios = require("axios").default;
const { google } = require("googleapis");

exports.login = async (page) => {
  await page.goto("/");

  await page.click('a[href="/sign_in"]');
  await page
    .locator(':nth-match(:text("メールアドレスでログイン"), 1)')
    .click();

  await page.fill('input[type="email"]', process.env.EMAIL);
  await page.click('input[type="submit"]');

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
