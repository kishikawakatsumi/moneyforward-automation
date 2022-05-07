"use strict";

const { chromium } = require("playwright");
const { google } = require("googleapis");
const { parse } = require("csv-parse");
const { TextDecoder } = require("util");
const { login, googleAuth, sleep } = require("./common");
require("dotenv").config();

const endYear = 2008;
const zip = (a, b) =>
  Array(Math.max(b.length, a.length))
    .fill()
    .map((_, i) => [a[i], b[i]]);

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    baseURL: "https://moneyforward.com",
  });

  const page = await context.newPage();
  await login(page);

  await push(page);
  await fetch(context);

  await browser.close();
})();

async function push(page) {
  await page.goto("/cf");

  const today = new Date();
  today.setDate(1);

  const next = async () => {
    await sleep(4000);

    if (today.getFullYear() === endYear) {
      return false;
    }

    const prevButton = await page.locator("button.fc-button-prev");
    await prevButton.click();

    today.setMonth(today.getMonth() - 1);

    return true;
  };

  do {
    const year = today.getFullYear();
    const month = `${today.getMonth() + 1}`;
    const sheet = `${year}/${month.padStart(2, "0")}`;
    const date = `${sheet}/01`;

    console.log(`Uploading... [${year}/${month.padStart(2, "0")}]`);

    await page.waitForSelector(
      `.fc-header-title.in-out-header-title >> text=${date}`
    );

    const auth = await googleAuth();
    const sheets = google.sheets({ version: "v4", auth });

    let values;
    try {
      const response = await sheets.spreadsheets.values.get({
        auth,
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: sheet,
      });
      values = response.data.values;
      values.reverse();
    } catch (error) {
      continue;
    }

    loop: while (true) {
      const rows = Array.from(await page.$$("tr.transaction_list"));
      rows.reverse();

      for (const [value, row] of zip(values, rows)) {
        if (!value || !row) {
          continue;
        }

        const contentCell = await row.$("td.content");
        const content = (await contentCell.textContent()).trim();

        const lctgDropdown = await row.$("td.lctg a.v_l_ctg");
        if (!lctgDropdown) {
          continue;
        }
        const lctg = (await lctgDropdown.textContent()).trim();

        const mctgDropdown = await row.$("td.mctg a.v_m_ctg");
        if (!mctgDropdown) {
          continue;
        }
        const mctg = (await mctgDropdown.textContent()).trim();

        if (content === value[2]) {
          if (lctg !== value[5]) {
            // prettier-ignore
            console.log(
            `${value[1]} "${content.substr(0, 20)}" [${lctg}] => [${value[5]}]`
          );
            await lctgDropdown.click();
            await page.waitForSelector("ul.dropdown-menu");
            const submenu = await row.$(`a.l_c_name >> text=${value[5]}`);
            await submenu.click();
            await sleep(10000);
            continue loop;
          }
          if (mctg !== value[6]) {
            // prettier-ignore
            console.log(
            `${value[1]} "${content.substr(0, 20)}" [${mctg}] => [${value[6]}]`
          );
            await mctgDropdown.click();
            await page.waitForSelector("ul.dropdown-menu");
            const submenu = await row.$(`a.m_c_name >> text=${value[6]}`);
            await submenu.click();
            await sleep(10000);
            continue loop;
          }
        }
      }
      break;
    }
  } while (await next());
}

async function fetch(context) {
  const today = new Date();
  today.setDate(1);

  const next = async () => {
    await sleep(10000);

    if (today.getFullYear() === endYear) {
      return false;
    }
    today.setMonth(today.getMonth() - 1);

    return true;
  };

  do {
    const year = today.getFullYear();
    const month = `${today.getMonth() + 1}`;
    const sheet = `${year}/${month.padStart(2, "0")}`;
    const date = `${sheet}/01`;

    console.log(`Fetching... [${year}/${month.padStart(2, "0")}]`);

    const response = await context.request.get(
      `/cf/csv?from=${date}&month=${month}&year=${year}`
    );

    const textDecoder = new TextDecoder("shift_jis");
    parse(
      textDecoder.decode(await response.body()),
      { columns: false, trim: true },
      async (error, records, info) => {
        if (error) {
          throw error;
        }
        if (info.records === 1) {
          return;
        }

        let sheetId;

        const auth = await googleAuth();
        const sheets = google.sheets({ version: "v4", auth });

        try {
          const response = await sheets.spreadsheets.get({
            spreadsheetId: process.env.SPREADSHEET_ID,
            ranges: [sheet],
          });
          sheetId = response.data.sheets[0].properties.sheetId;
          console.log(`Updating [${sheet}]`);
        } catch (error) {
          console.log(`Insert [${sheet}]`);
          const response = await sheets.spreadsheets.batchUpdate({
            auth,
            spreadsheetId: process.env.SPREADSHEET_ID,
            resource: {
              requests: [
                {
                  addSheet: {
                    properties: {
                      title: sheet,
                    },
                  },
                },
              ],
            },
          });
          sheetId = response.data.replies[0].addSheet.properties.sheetId;
        }

        await sleep(1000);

        await sheets.spreadsheets.values.clear({
          auth,
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: sheet,
        });
        sheets.spreadsheets.values.append({
          auth,
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: sheet,
          valueInputOption: "RAW",
          insertDataOption: "OVERWRITE",
          resource: {
            values: records,
          },
        });

        await sleep(1000);

        await sheets.spreadsheets.batchUpdate({
          auth,
          spreadsheetId: process.env.SPREADSHEET_ID,
          resource: {
            requests: [
              {
                updateSheetProperties: {
                  properties: {
                    sheetId,
                    gridProperties: {
                      frozenRowCount: 1,
                    },
                  },
                  fields: "gridProperties.frozenRowCount",
                },
              },
              {
                setDataValidation: {
                  range: {
                    sheetId,
                    startRowIndex: 1,
                    endRowIndex: info.records,
                    startColumnIndex: 5,
                    endColumnIndex: 6,
                  },
                  rule: {
                    condition: {
                      type: "ONE_OF_RANGE",
                      values: [
                        {
                          userEnteredValue: "=category!$A$1:$S$1",
                        },
                      ],
                    },
                    strict: true,
                    showCustomUi: true,
                  },
                },
              },
              {
                addConditionalFormatRule: {
                  rule: {
                    ranges: [
                      {
                        sheetId,
                        startRowIndex: 1,
                        endRowIndex: info.records,
                      },
                    ],
                    booleanRule: {
                      condition: {
                        type: "CUSTOM_FORMULA",
                        values: [
                          {
                            userEnteredValue:
                              '=EQ(INDIRECT(ADDRESS(ROW(), 1)), "0")',
                          },
                        ],
                      },
                      format: {
                        backgroundColor: {
                          red: 0.753,
                          green: 0.753,
                          blue: 0.753,
                        },
                      },
                    },
                  },
                  index: 0,
                },
              },
              {
                addConditionalFormatRule: {
                  rule: {
                    ranges: [
                      {
                        sheetId,
                        startRowIndex: 1,
                        endRowIndex: info.records,
                        startColumnIndex: 5,
                        endColumnIndex: 7,
                      },
                    ],
                    booleanRule: {
                      condition: {
                        type: "TEXT_EQ",
                        values: [
                          {
                            userEnteredValue: "未分類",
                          },
                        ],
                      },
                      format: {
                        backgroundColor: {
                          red: 0.98,
                          green: 0.859,
                          blue: 0.847,
                        },
                      },
                    },
                  },
                  index: 1,
                },
              },
              ...Array(info.records - 1)
                .fill()
                .map((v, i) => ({
                  setDataValidation: {
                    range: {
                      sheetId,
                      startRowIndex: i + 1,
                      endRowIndex: i + 2,
                      startColumnIndex: 6,
                      endColumnIndex: 7,
                    },
                    rule: {
                      condition: {
                        type: "ONE_OF_RANGE",
                        values: [
                          {
                            userEnteredValue: `=$M$${i + 2}:$Z$${i + 2}`,
                          },
                        ],
                      },
                      strict: true,
                      showCustomUi: true,
                    },
                  },
                })),
            ],
          },
        });

        await sleep(1000);

        await sheets.spreadsheets.values.batchUpdate({
          auth,
          spreadsheetId: process.env.SPREADSHEET_ID,
          resource: {
            valueInputOption: "USER_ENTERED",
            data: Array(info.records - 1)
              .fill()
              .map((v, i) => ({
                range: `${sheet}!M${i + 2}`,
                values: [[`=TRANSPOSE(INDIRECT(F${i + 2}))`]],
              })),
          },
        });
      }
    );
  } while (await next());
}
